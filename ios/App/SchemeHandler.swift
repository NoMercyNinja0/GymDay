import Foundation
import WebKit

/// Serves the page from inside the app at gymday-app://localhost/ (a proper web address, so the page's storage, fetches and
/// images behave as in a browser), and answers the page's one call that must come back at once: a stored photo.
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "gymday-app"

    private let root: URL? = Bundle.main.url(forResource: "www", withExtension: nil)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }

        if path.hasPrefix("/__photo/") {
            let id = String(path.dropFirst("/__photo/".count))
            let s = Files.shared.loadPhoto(id: id)
            respond(task, url, s.isEmpty ? 404 : 200, Data(s.utf8), "text/plain; charset=utf-8")
            return
        }

        guard let root = root else {
            respond(task, url, 404, Data(), "text/plain")
            return
        }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            respond(task, url, 404, Data("Not found".utf8), "text/plain")
            return
        }
        respond(task, url, 200, data, Self.type(of: file.pathExtension.lowercased()))
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        // every answer is given at once in start, so there is nothing left to stop
    }

    private func respond(_ task: WKURLSchemeTask, _ url: URL, _ code: Int, _ data: Data, _ type: String) {
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"]
        guard let r = HTTPURLResponse(url: url, statusCode: code, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(URLError(.cannotParseResponse))
            return
        }
        task.didReceive(r)
        task.didReceive(data)
        task.didFinish()
    }

    static func type(of ext: String) -> String {
        switch ext {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "mp3": return "audio/mpeg"
        case "mp4": return "video/mp4"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}
