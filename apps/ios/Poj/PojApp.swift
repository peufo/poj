import SwiftUI

@main
struct PojApp: App {
    @State private var session = SessionModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if session.isSignedIn {
                    NotesView(client: session.client, onUnauthorized: session.signOut)
                } else {
                    LoginView()
                }
            }
            .environment(session)
        }
    }
}
