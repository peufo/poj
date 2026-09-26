import SwiftUI

struct LoginView: View {
    @Environment(SessionModel.self) private var session

    @State private var isRegistering = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Form {
                if isRegistering {
                    TextField("Nom", text: $name)
                        .textContentType(.name)
                }
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Mot de passe", text: $password)
                    .textContentType(isRegistering ? .newPassword : .password)

                if let error {
                    Text(error).foregroundStyle(.red)
                }

                Button(isRegistering ? "Créer mon compte" : "Se connecter", action: submit)
                    .disabled(isLoading || email.isEmpty || password.isEmpty)

                Button(isRegistering ? "J’ai déjà un compte" : "Créer un compte") {
                    isRegistering.toggle()
                    error = nil
                }
                .buttonStyle(.borderless)
            }
            .navigationTitle(isRegistering ? "Inscription" : "Connexion")
        }
    }

    private func submit() {
        isLoading = true
        error = nil
        Task {
            defer { isLoading = false }
            do {
                if isRegistering {
                    try await session.signUp(name: name, email: email, password: password)
                } else {
                    try await session.signIn(email: email, password: password)
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
