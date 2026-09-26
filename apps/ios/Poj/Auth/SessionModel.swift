import Foundation
import Observation
import PojAPI

@MainActor @Observable
final class SessionModel {
    private(set) var isSignedIn: Bool
    let client: Client
    private let tokens: TokenStore

    init(tokens: TokenStore = TokenStore()) {
        self.tokens = tokens
        self.isSignedIn = tokens.read() != nil
        self.client = .poj(baseURL: Config.apiBaseURL, token: { tokens.read() })
    }

    func signIn(email: String, password: String) async throws {
        let response = try await client.signInEmail(body: .json(.init(email: email, password: password)))
        switch response {
        case .ok(let ok):
            try store(ok.headers.setAuthToken)
        case .unauthorized(let error):
            throw AuthFailure(try? error.body.json.message)
        case .badRequest(let error):
            throw AuthFailure(try? error.body.json.message)
        case .unprocessableContent(let error):
            throw AuthFailure(try? error.body.json.message)
        case .undocumented(let status, _):
            throw AuthFailure("Erreur serveur (\(status))")
        }
    }

    func signUp(name: String, email: String, password: String) async throws {
        let response = try await client.signUpEmail(
            body: .json(.init(name: name, email: email, password: password)))
        switch response {
        case .ok(let ok):
            try store(ok.headers.setAuthToken)
        case .unauthorized(let error):
            throw AuthFailure(try? error.body.json.message)
        case .badRequest(let error):
            throw AuthFailure(try? error.body.json.message)
        case .unprocessableContent(let error):
            throw AuthFailure(try? error.body.json.message)
        case .undocumented(let status, _):
            throw AuthFailure("Erreur serveur (\(status))")
        }
    }

    func signOut() {
        let client = client
        Task { _ = try? await client.signOut() }
        tokens.delete()
        isSignedIn = false
    }

    private func store(_ token: String?) throws {
        guard let token, !token.isEmpty else { throw AuthFailure("Token absent de la réponse") }
        tokens.save(token)
        isSignedIn = true
    }
}

struct AuthFailure: LocalizedError {
    let errorDescription: String?
    init(_ message: String?) { errorDescription = message ?? "Échec de l’authentification" }
}
