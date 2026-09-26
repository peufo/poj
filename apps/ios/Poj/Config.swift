import Foundation

enum Config {
    /// Origine du serveur, définie par `API_BASE_URL` dans Config/*.xcconfig.
    static let apiBaseURL: URL = {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
            let url = URL(string: value)
        else { fatalError("API_BASE_URL manquant ou invalide dans Info.plist") }
        return url
    }()
}
