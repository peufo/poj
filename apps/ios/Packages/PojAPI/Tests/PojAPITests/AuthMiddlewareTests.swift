import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import PojAPI

@Suite struct AuthMiddlewareTests {
    private func authorizationHeader(token: String?) async throws -> String? {
        let middleware = AuthMiddleware(token: { token })
        let request = HTTPRequest(method: .get, scheme: "http", authority: "localhost", path: "/api/v1/notes")
        let captured = Captured()
        _ = try await middleware.intercept(
            request, body: nil, baseURL: URL(string: "http://localhost")!, operationID: "listNotes"
        ) { request, body, _ in
            await captured.set(request.headerFields[.authorization])
            return (HTTPResponse(status: .ok), body)
        }
        return await captured.value
    }

    @Test func addsBearerHeaderWhenTokenIsAvailable() async throws {
        #expect(try await authorizationHeader(token: "abc") == "Bearer abc")
    }

    @Test func leavesRequestUntouchedWithoutToken() async throws {
        #expect(try await authorizationHeader(token: nil) == nil)
    }
}

private actor Captured {
    var value: String?
    func set(_ value: String?) { self.value = value }
}
