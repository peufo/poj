import Foundation
import Observation
import PojAPI

typealias Note = Components.Schemas.Note

@MainActor @Observable
final class NotesModel {
    private(set) var notes: [Note] = []
    var error: String?

    private let client: Client
    private let onUnauthorized: () -> Void

    init(client: Client, onUnauthorized: @escaping () -> Void) {
        self.client = client
        self.onUnauthorized = onUnauthorized
    }

    func load() async {
        do {
            switch try await client.listNotes() {
            case .ok(let ok):
                notes = try ok.body.json.data
                error = nil
            case .unauthorized:
                onUnauthorized()
            default:
                error = "Impossible de charger les notes"
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// L'id est généré ici : rejouer la requête (réseau instable) ne crée pas de doublon.
    func create(title: String, content: String) async {
        let body = Components.Schemas.CreateNote(
            id: UUID().uuidString.lowercased(), title: title, content: content)
        do {
            switch try await client.createNote(body: .json(body)) {
            case .created, .ok:
                await load()
            case .unauthorized:
                onUnauthorized()
            default:
                error = "Impossible de créer la note"
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func delete(_ note: Note) async {
        do {
            switch try await client.deleteNote(path: .init(id: note.id)) {
            case .noContent, .notFound:
                notes.removeAll { $0.id == note.id }
            case .unauthorized:
                onUnauthorized()
            default:
                error = "Impossible de supprimer la note"
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
