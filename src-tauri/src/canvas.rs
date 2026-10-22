//! Read-only Canvas HTTP. Every request is a GET under `/api/v1/` on the configured base URL,
//! and paginated array responses are followed through their `Link: rel="next"` headers.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use url::Url;

/// Upper bound on pages followed for one request, so a misbehaving server can't loop us forever.
pub const MAX_PAGES: usize = 50;

/// How hard to try again when Canvas throttles us. Canvas meters each token with a leaky bucket
/// (`X-Rate-Limit-Remaining`) that refills within seconds, so a short, jittered wait is enough.
#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    /// Tries per page, the first included.
    pub attempts: u32,
    /// Wait before the first retry; doubled for each one after.
    pub base: Duration,
    /// Longest wait, even when Canvas sends a longer `Retry-After`.
    pub max_wait: Duration,
}

pub const RETRY: RetryPolicy = RetryPolicy {
    attempts: 3,
    base: Duration::from_millis(1000),
    max_wait: Duration::from_secs(10),
};

/// A 403 from a bucket this close to empty is throttling, whatever the body says.
const LOW_REMAINING: f64 = 10.0;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum CanvasError {
    #[error("invalid Canvas URL: {0}")]
    InvalidBaseUrl(String),
    #[error("path is not an allowed Canvas API path: {0}")]
    ForbiddenPath(String),
    #[error("not connected to Canvas")]
    NotConnected,
    #[error("Canvas rejected the credentials (401)")]
    Unauthorized,
    #[error("Canvas returned {status}: {body}")]
    Http { status: u16, body: String },
    /// Still throttled after every retry. src/canvas/errors.ts matches "rate limit" in this text.
    #[error("Canvas rate limit exceeded ({status}); try again in a moment")]
    RateLimited { status: u16 },
    #[error("network error: {0}")]
    Network(String),
    #[error("unexpected response: {0}")]
    Decode(String),
}

/// Normalises a user-supplied Canvas URL to its origin (`https://canvas.example.edu`).
/// Only https is accepted, except loopback hosts which tests and local mirrors use.
pub fn normalize_base_url(input: &str) -> Result<Url, CanvasError> {
    let trimmed = input.trim();
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&with_scheme).map_err(|e| CanvasError::InvalidBaseUrl(e.to_string()))?;
    let host = url
        .host_str()
        .ok_or_else(|| CanvasError::InvalidBaseUrl("missing host".into()))?
        .to_string();
    let loopback = host == "localhost" || host == "127.0.0.1";
    match url.scheme() {
        "https" => {}
        "http" if loopback => {}
        other => return Err(CanvasError::InvalidBaseUrl(format!("scheme {other} is not allowed"))),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(CanvasError::InvalidBaseUrl("credentials in URL are not allowed".into()));
    }
    let mut origin = Url::parse(&format!("{}://{}", url.scheme(), host))
        .map_err(|e| CanvasError::InvalidBaseUrl(e.to_string()))?;
    origin
        .set_port(url.port())
        .map_err(|_| CanvasError::InvalidBaseUrl("bad port".into()))?;
    Ok(origin)
}

/// Allows only plain paths under `/api/v1/`: no traversal, query, fragment, encoding tricks or
/// doubled slashes. The query string is passed separately and encoded by us.
pub fn validate_api_path(path: &str) -> Result<(), CanvasError> {
    let forbidden = || CanvasError::ForbiddenPath(path.to_string());
    if !path.starts_with("/api/v1/") || path.len() > 512 {
        return Err(forbidden());
    }
    if path.contains("..") || path.contains("//") {
        return Err(forbidden());
    }
    let ok_chars = path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '.'));
    if !ok_chars {
        return Err(forbidden());
    }
    Ok(())
}

pub fn build_url(base: &Url, path: &str, query: &[(String, String)]) -> Result<Url, CanvasError> {
    validate_api_path(path)?;
    let mut url = base.join(path).map_err(|e| CanvasError::ForbiddenPath(e.to_string()))?;
    if !query.is_empty() {
        url.query_pairs_mut().extend_pairs(query.iter().map(|(k, v)| (k.as_str(), v.as_str())));
    }
    Ok(url)
}

/// Extracts the `rel="next"` URL from a Link header.
pub fn parse_next_link(header: &str) -> Option<String> {
    header.split(',').find_map(|part| {
        let mut pieces = part.split(';');
        let target = pieces.next()?.trim();
        let is_next = pieces.any(|p| {
            let p = p.trim().replace(' ', "");
            p == "rel=\"next\"" || p == "rel=next"
        });
        if is_next && target.starts_with('<') && target.ends_with('>') {
            Some(target[1..target.len() - 1].to_string())
        } else {
            None
        }
    })
}

/// A next-page link must stay on the same origin and under `/api/v1/`, otherwise we'd be sending
/// the bearer token wherever a response told us to.
pub fn is_allowed_next(base: &Url, next: &str) -> Option<Url> {
    let url = Url::parse(next).ok()?;
    let same_origin = url.scheme() == base.scheme()
        && url.host_str() == base.host_str()
        && url.port_or_known_default() == base.port_or_known_default();
    if same_origin && validate_api_path(url.path()).is_ok() {
        Some(url)
    } else {
        None
    }
}

/// Canvas throttles with 403 "Rate Limit Exceeded" (and an empty `X-Rate-Limit-Remaining`
/// bucket); proxies in front of it may answer 429. A 403 for anything else is a permission error.
pub fn is_throttled(status: u16, remaining: Option<f64>, body: &str) -> bool {
    match status {
        429 => true,
        403 => {
            body.to_ascii_lowercase().contains("rate limit")
                || remaining.is_some_and(|r| r <= LOW_REMAINING)
        }
        _ => false,
    }
}

/// How long to wait before retry number `retry` (1-based): `Retry-After` if Canvas sent one,
/// otherwise exponential backoff. `jitter` (0..1) spreads out the widgets that were throttled
/// together, so they don't all come back at the same instant.
pub fn retry_delay(
    policy: &RetryPolicy,
    retry: u32,
    retry_after: Option<Duration>,
    jitter: f64,
) -> Duration {
    let wait = retry_after.unwrap_or_else(|| {
        let full = policy.base.saturating_mul(1 << retry.saturating_sub(1).min(16));
        full.mul_f64(0.5 + 0.5 * jitter.clamp(0.0, 1.0))
    });
    wait.min(policy.max_wait)
}

fn jitter() -> f64 {
    f64::from(uuid::Uuid::new_v4().as_u128() as u16) / f64::from(u16::MAX)
}

fn header<'a>(response: &'a reqwest::Response, name: &str) -> Option<&'a str> {
    response.headers().get(name).and_then(|v| v.to_str().ok())
}

/// Performs one GET and returns its JSON body and next-page link. Throttled requests are tried
/// again after a pause, up to `policy.attempts` times in all.
async fn get_page(
    http: &reqwest::Client,
    url: Url,
    token: &str,
    policy: &RetryPolicy,
) -> Result<(Value, Option<String>), CanvasError> {
    let mut attempt = 1;
    loop {
        let response = http
            .get(url.clone())
            .bearer_auth(token)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| CanvasError::Network(e.to_string()))?;
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            let body = response.text().await.unwrap_or_default();
            if is_credential_rejection(&body) {
                return Err(CanvasError::Unauthorized);
            }
            return Err(CanvasError::Http { status: 401, body: body.chars().take(300).collect() });
        }
        let next = header(&response, "link").and_then(parse_next_link);
        if status.is_success() {
            let body = response
                .json::<Value>()
                .await
                .map_err(|e| CanvasError::Decode(e.to_string()))?;
            return Ok((body, next));
        }
        let remaining = header(&response, "x-rate-limit-remaining").and_then(|v| v.trim().parse().ok());
        let retry_after = header(&response, "retry-after")
            .and_then(|v| v.trim().parse::<u64>().ok())
            .map(Duration::from_secs);
        let body = response.text().await.unwrap_or_default();
        if !is_throttled(status.as_u16(), remaining, &body) {
            return Err(CanvasError::Http {
                status: status.as_u16(),
                body: body.chars().take(300).collect(),
            });
        }
        if attempt >= policy.attempts {
            return Err(CanvasError::RateLimited { status: status.as_u16() });
        }
        tokio::time::sleep(retry_delay(policy, attempt, retry_after, jitter())).await;
        attempt += 1;
    }
}

/// GETs `path` and, for array responses, concatenates every page.
pub async fn get_all(
    http: &reqwest::Client,
    base: &Url,
    token: &str,
    path: &str,
    query: &[(String, String)],
) -> Result<Value, CanvasError> {
    get_all_with(http, base, token, path, query, &RETRY).await
}

async fn get_all_with(
    http: &reqwest::Client,
    base: &Url,
    token: &str,
    path: &str,
    query: &[(String, String)],
    policy: &RetryPolicy,
) -> Result<Value, CanvasError> {
    let url = build_url(base, path, query)?;
    let (first, mut next) = get_page(http, url, token, policy).await?;
    let Value::Array(mut items) = first else {
        return Ok(first);
    };
    let mut pages = 1;
    while let Some(link) = next.take() {
        if pages >= MAX_PAGES {
            break;
        }
        let Some(url) = is_allowed_next(base, &link) else {
            break;
        };
        let (page, following) = get_page(http, url, token, policy).await?;
        match page {
            Value::Array(more) => items.extend(more),
            _ => break,
        }
        next = following;
        pages += 1;
    }
    Ok(Value::Array(items))
}

/// Canvas answers 401 both for a bad token ("Invalid access token.") and for a good token asking
/// for something it may not see ("user not authorized to perform that action"). Only the first
/// means the credentials are expired or revoked. Mirrors `isCredentialRejection` in
/// src/canvas/token.ts.
pub fn is_credential_rejection(body: &str) -> bool {
    !body.to_ascii_lowercase().contains("user not authorized to perform that action")
}

/// What the frontend may know about the connected token's expiry (see src/canvas/token.ts).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum TokenExpiry {
    Expires {
        #[serde(rename = "expiresAt")]
        expires_at: String,
    },
    Never,
    Unknown,
    NotApplicable,
}

/// Canvas looks a token up by its hint: the first five characters of the random part, after the
/// `<shard id>~` prefix.
pub fn token_hint(token: &str) -> Option<String> {
    let random = token.trim().rsplit('~').next().unwrap_or_default();
    let hint: String = random.chars().take(5).collect();
    // Canvas's are letters and digits; - and _ (the mock's tokens) are safe in the path too.
    let safe = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
    (hint.len() == 5 && hint.chars().all(safe)).then_some(hint)
}

/// Reads `GET /api/v1/users/self/tokens/:hint`. `visible_token` (`<shard id>~<hint>...`) must
/// show the same hint, so a different token of the same user is never mistaken for this one.
pub fn read_token_expiry(body: &Value, hint: &str) -> TokenExpiry {
    let Some(visible) = body.get("visible_token").and_then(Value::as_str) else {
        return TokenExpiry::Unknown;
    };
    let shown = visible.trim_end_matches("...").rsplit('~').next().unwrap_or_default();
    if shown != hint {
        return TokenExpiry::Unknown;
    }
    match body.get("expires_at") {
        Some(Value::Null) => TokenExpiry::Never,
        Some(Value::String(at)) if at.len() >= 10 && at.as_bytes()[0].is_ascii_digit() => {
            TokenExpiry::Expires { expires_at: at.clone() }
        }
        _ => TokenExpiry::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_rejected_credentials_from_permission_errors() {
        assert!(is_credential_rejection(r#"{"errors":[{"message":"Invalid access token."}]}"#));
        assert!(is_credential_rejection(
            r#"{"status":"unauthenticated","errors":[{"message":"user authorization required"}]}"#
        ));
        assert!(!is_credential_rejection(
            r#"{"status":"unauthorized","errors":[{"message":"user not authorized to perform that action"}]}"#
        ));
    }

    #[test]
    fn derives_token_hints() {
        assert_eq!(token_hint("1234~AbCde7890xyz").as_deref(), Some("AbCde"));
        assert_eq!(token_hint(" AbCde7890xyz ").as_deref(), Some("AbCde"));
        assert_eq!(token_hint("mock-realistic").as_deref(), Some("mock-"));
        assert_eq!(token_hint("1~ab"), None);
        assert_eq!(token_hint("1~ab/cd"), None);
    }

    #[test]
    fn reads_token_expiry() {
        let body = |visible: &str, expires: Value| {
            serde_json::json!({ "visible_token": visible, "expires_at": expires })
        };
        assert_eq!(
            read_token_expiry(&body("7~AbCde...", "2030-01-02T03:04:05Z".into()), "AbCde"),
            TokenExpiry::Expires { expires_at: "2030-01-02T03:04:05Z".into() }
        );
        assert_eq!(read_token_expiry(&body("7~AbCde...", Value::Null), "AbCde"), TokenExpiry::Never);
        assert_eq!(read_token_expiry(&body("7~Other...", Value::Null), "AbCde"), TokenExpiry::Unknown);
        assert_eq!(
            read_token_expiry(&serde_json::json!({ "visible_token": "AbCde..." }), "AbCde"),
            TokenExpiry::Unknown
        );
        assert_eq!(read_token_expiry(&serde_json::json!([]), "AbCde"), TokenExpiry::Unknown);
        assert_eq!(
            serde_json::to_value(TokenExpiry::Expires { expires_at: "2030-01-02T03:04:05Z".into() })
                .unwrap(),
            serde_json::json!({ "status": "expires", "expiresAt": "2030-01-02T03:04:05Z" })
        );
        assert_eq!(
            serde_json::to_value(TokenExpiry::NotApplicable).unwrap(),
            serde_json::json!({ "status": "not-applicable" })
        );
    }

    /// A bad token is a credential failure; a good token refused one resource is not.
    #[tokio::test]
    async fn permission_401s_are_not_credential_failures() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            for body in [
                r#"{"errors":[{"message":"Invalid access token."}]}"#,
                r#"{"status":"unauthorized","errors":[{"message":"user not authorized to perform that action"}]}"#,
            ] {
                let (mut sock, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf).await.unwrap();
                let resp = format!(
                    "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                sock.write_all(resp.as_bytes()).await.unwrap();
            }
        });
        let base = normalize_base_url(&format!("http://127.0.0.1:{port}")).unwrap();
        let http = reqwest::Client::new();
        assert_eq!(
            get_all(&http, &base, "t", "/api/v1/courses", &[]).await,
            Err(CanvasError::Unauthorized)
        );
        assert!(matches!(
            get_all(&http, &base, "t", "/api/v1/courses/1", &[]).await,
            Err(CanvasError::Http { status: 401, .. })
        ));
    }

    /// Answers one connection per canned response and hands back the requests it read.
    async fn serve(responses: Vec<Vec<u8>>) -> (u16, tokio::task::JoinHandle<Vec<String>>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            let mut seen = Vec::new();
            for resp in responses {
                let (mut sock, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 4096];
                let n = sock.read(&mut buf).await.unwrap();
                seen.push(String::from_utf8_lossy(&buf[..n]).to_lowercase());
                sock.write_all(&resp).await.unwrap();
            }
            seen
        });
        (port, task)
    }

    fn response(status: &str, headers: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    const FAST: RetryPolicy = RetryPolicy {
        attempts: 3,
        base: Duration::from_millis(1),
        max_wait: Duration::from_millis(5),
    };

    #[test]
    fn recognises_throttling() {
        assert!(is_throttled(403, None, "403 Forbidden (Rate Limit Exceeded)"));
        assert!(is_throttled(403, None, r#"{"errors":[{"message":"Rate Limit Exceeded"}]}"#));
        assert!(is_throttled(403, Some(0.0), ""));
        assert!(is_throttled(429, None, ""));
        assert!(!is_throttled(403, Some(650.0), r#"{"errors":[{"message":"forbidden"}]}"#));
        assert!(!is_throttled(403, None, "user not authorized to perform that action"));
        assert!(!is_throttled(503, Some(0.0), "Rate Limit Exceeded"));
    }

    #[test]
    fn backs_off_exponentially_with_jitter() {
        assert_eq!(retry_delay(&RETRY, 1, None, 1.0), Duration::from_secs(1));
        assert_eq!(retry_delay(&RETRY, 1, None, 0.0), Duration::from_millis(500));
        assert_eq!(retry_delay(&RETRY, 2, None, 1.0), Duration::from_secs(2));
        assert_eq!(retry_delay(&RETRY, 9, None, 1.0), RETRY.max_wait);
        assert_eq!(retry_delay(&RETRY, 1, Some(Duration::from_secs(3)), 0.0), Duration::from_secs(3));
        assert_eq!(retry_delay(&RETRY, 1, Some(Duration::from_secs(600)), 0.0), RETRY.max_wait);
        assert!((0.0..=1.0).contains(&jitter()));
    }

    /// The frontend tells error kinds apart by this text (src/canvas/errors.ts).
    #[test]
    fn error_messages_stay_stable() {
        assert_eq!(
            CanvasError::RateLimited { status: 403 }.to_string(),
            "Canvas rate limit exceeded (403); try again in a moment"
        );
        assert_eq!(CanvasError::Unauthorized.to_string(), "Canvas rejected the credentials (401)");
        assert_eq!(
            CanvasError::Http { status: 503, body: "x".into() }.to_string(),
            "Canvas returned 503: x"
        );
        assert_eq!(CanvasError::Network("timed out".into()).to_string(), "network error: timed out");
    }

    #[tokio::test]
    async fn retries_throttled_requests() {
        let throttled = r#"{"errors":[{"message":"Rate Limit Exceeded"}]}"#;
        let (port, server) = serve(vec![
            response("403 Forbidden", "X-Rate-Limit-Remaining: 0.0\r\n", throttled),
            response("429 Too Many Requests", "Retry-After: 0\r\n", ""),
            response("200 OK", "", r#"[{"id":1}]"#),
        ])
        .await;
        let base = normalize_base_url(&format!("http://127.0.0.1:{port}")).unwrap();
        let http = reqwest::Client::new();
        let value = get_all_with(&http, &base, "t", "/api/v1/items", &[], &FAST).await.unwrap();
        assert_eq!(value, serde_json::json!([{"id":1}]));
        assert_eq!(server.await.unwrap().len(), 3);
    }

    #[tokio::test]
    async fn gives_up_after_the_last_attempt() {
        let throttled = "403 Forbidden (Rate Limit Exceeded)";
        let (port, server) =
            serve((0..FAST.attempts).map(|_| response("403 Forbidden", "", throttled)).collect())
                .await;
        let base = normalize_base_url(&format!("http://127.0.0.1:{port}")).unwrap();
        let http = reqwest::Client::new();
        assert_eq!(
            get_all_with(&http, &base, "t", "/api/v1/items", &[], &FAST).await,
            Err(CanvasError::RateLimited { status: 403 })
        );
        assert_eq!(server.await.unwrap().len(), FAST.attempts as usize);
    }

    #[tokio::test]
    async fn does_not_retry_permission_errors() {
        let body = r#"{"status":"unauthorized","errors":[{"message":"forbidden"}]}"#;
        let (port, server) =
            serve(vec![response("403 Forbidden", "X-Rate-Limit-Remaining: 640.5\r\n", body)]).await;
        let base = normalize_base_url(&format!("http://127.0.0.1:{port}")).unwrap();
        let http = reqwest::Client::new();
        assert!(matches!(
            get_all_with(&http, &base, "t", "/api/v1/items", &[], &FAST).await,
            Err(CanvasError::Http { status: 403, .. })
        ));
        assert_eq!(server.await.unwrap().len(), 1);
    }

    /// Canvas compresses JSON when asked; reqwest asks and decodes it (the gzip/brotli features).
    #[tokio::test]
    async fn accepts_compressed_responses() {
        // gzip of `[{"id":1}]`.
        let gz: [u8; 30] = [
            31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 139, 174, 86, 202, 76, 81, 178, 50, 172, 141, 5, 0,
            100, 168, 229, 104, 10, 0, 0, 0,
        ];
        let mut resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: gzip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            gz.len()
        )
        .into_bytes();
        resp.extend_from_slice(&gz);
        let (port, server) = serve(vec![resp]).await;
        let base = normalize_base_url(&format!("http://127.0.0.1:{port}")).unwrap();
        let http = reqwest::Client::new();
        let value = get_all(&http, &base, "t", "/api/v1/items", &[]).await.unwrap();
        assert_eq!(value, serde_json::json!([{"id":1}]));
        let request = &server.await.unwrap()[0];
        let accept = request.lines().find(|l| l.starts_with("accept-encoding:")).unwrap();
        assert!(accept.contains("gzip") && accept.contains("br"), "{accept}");
    }

    #[test]
    fn normalizes_base_urls() {
        assert_eq!(
            normalize_base_url("canvas.example.edu/courses").unwrap().as_str(),
            "https://canvas.example.edu/"
        );
        assert_eq!(
            normalize_base_url(" https://canvas.example.edu:8443/x ").unwrap().as_str(),
            "https://canvas.example.edu:8443/"
        );
        assert!(normalize_base_url("http://canvas.example.edu").is_err());
        assert!(normalize_base_url("http://127.0.0.1:9999").is_ok());
        assert!(normalize_base_url("https://user:pw@canvas.example.edu").is_err());
        assert!(normalize_base_url("ftp://canvas.example.edu").is_err());
    }

    #[test]
    fn allows_only_api_v1_paths() {
        assert!(validate_api_path("/api/v1/courses").is_ok());
        assert!(validate_api_path("/api/v1/courses/123/assignments").is_ok());
        assert!(validate_api_path("/api/v1/users/self/todo").is_ok());
        for bad in [
            "/api/v2/courses",
            "/login/oauth2/token",
            "/api/v1/../login",
            "/api/v1//evil.com",
            "/api/v1/courses?x=1",
            "/api/v1/courses#x",
            "/api/v1/%2e%2e/login",
            "/api/v1/courses\\..",
            "https://evil.com/api/v1/courses",
            "api/v1/courses",
        ] {
            assert!(validate_api_path(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn builds_urls_with_encoded_query() {
        let base = normalize_base_url("https://canvas.example.edu").unwrap();
        let url = build_url(
            &base,
            "/api/v1/courses",
            &[
                ("include[]".into(), "term".into()),
                ("include[]".into(), "total_scores".into()),
                ("per_page".into(), "100".into()),
            ],
        )
        .unwrap();
        assert_eq!(
            url.as_str(),
            "https://canvas.example.edu/api/v1/courses?include%5B%5D=term&include%5B%5D=total_scores&per_page=100"
        );
    }

    #[test]
    fn parses_link_headers() {
        let header = r#"<https://c.edu/api/v1/courses?page=1>; rel="current",<https://c.edu/api/v1/courses?page=2>; rel="next",<https://c.edu/api/v1/courses?page=1>; rel="first""#;
        assert_eq!(
            parse_next_link(header).as_deref(),
            Some("https://c.edu/api/v1/courses?page=2")
        );
        assert_eq!(parse_next_link(r#"<https://c.edu/a>; rel="last""#), None);
        assert_eq!(parse_next_link(""), None);
    }

    #[test]
    fn next_links_must_stay_on_origin_and_api() {
        let base = normalize_base_url("https://c.edu").unwrap();
        assert!(is_allowed_next(&base, "https://c.edu/api/v1/courses?page=2").is_some());
        assert!(is_allowed_next(&base, "https://evil.edu/api/v1/courses?page=2").is_none());
        assert!(is_allowed_next(&base, "http://c.edu/api/v1/courses?page=2").is_none());
        assert!(is_allowed_next(&base, "https://c.edu/login?page=2").is_none());
    }

    /// Serves canned pages from a local socket and checks `get_all` stitches them together.
    #[tokio::test]
    async fn follows_pagination() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            for page in 1..=3 {
                let (mut sock, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 4096];
                let n = sock.read(&mut buf).await.unwrap();
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                assert!(req.starts_with("GET /api/v1/items"));
                assert!(req.to_lowercase().contains("authorization: bearer secret"));
                let link = if page < 3 {
                    format!(
                        "Link: <http://127.0.0.1:{port}/api/v1/items?page={}>; rel=\"next\"\r\n",
                        page + 1
                    )
                } else {
                    String::new()
                };
                let body = format!("[{{\"id\":{page}}}]");
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{link}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                sock.write_all(resp.as_bytes()).await.unwrap();
            }
        });
        let base = normalize_base_url(&format!("http://127.0.0.1:{port}")).unwrap();
        let http = reqwest::Client::new();
        let value = get_all(&http, &base, "secret", "/api/v1/items", &[]).await.unwrap();
        assert_eq!(value, serde_json::json!([{"id":1},{"id":2},{"id":3}]));
    }
}
