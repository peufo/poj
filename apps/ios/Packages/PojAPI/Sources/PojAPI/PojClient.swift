import Foundation
import OpenAPIURLSession

extension Client {
    /// Client de l'API poj. `baseURL` est l'origine du serveur (les chemins du contrat incluent `/api`).
    public static func poj(baseURL: URL, token: @escaping @Sendable () async -> String?) -> Client {
        Client(
            serverURL: baseURL,
            transport: URLSessionTransport(),
            middlewares: [AuthMiddleware(token: token)]
        )
    }
}
