import PojAPI
import SwiftUI

struct NotesView: View {
    @Environment(SessionModel.self) private var session
    @State private var model: NotesModel
    @State private var isCreating = false

    init(client: Client, onUnauthorized: @escaping () -> Void) {
        _model = State(initialValue: NotesModel(client: client, onUnauthorized: onUnauthorized))
    }

    var body: some View {
        NavigationStack {
            List {
                if let error = model.error {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(model.notes, id: \.id) { note in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(note.title).font(.headline)
                        if !note.content.isEmpty {
                            Text(note.content).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Text(note.updatedAt, style: .relative).font(.caption).foregroundStyle(.tertiary)
                    }
                }
                .onDelete { offsets in
                    let targets = offsets.map { model.notes[$0] }
                    Task { for note in targets { await model.delete(note) } }
                }
            }
            .overlay {
                if model.notes.isEmpty && model.error == nil {
                    ContentUnavailableView("Aucune note", systemImage: "note.text")
                }
            }
            .navigationTitle("Mes notes")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Déconnexion", action: session.signOut)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Nouvelle note", systemImage: "plus") { isCreating = true }
                }
            }
            .refreshable { await model.load() }
            .task { await model.load() }
            .sheet(isPresented: $isCreating) {
                NewNoteView { title, content in await model.create(title: title, content: content) }
            }
        }
    }
}

private struct NewNoteView: View {
    let onSave: (String, String) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var content = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Titre", text: $title)
                TextField("Contenu", text: $content, axis: .vertical).lineLimit(3...10)
            }
            .navigationTitle("Nouvelle note")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ajouter") {
                        Task {
                            await onSave(title.trimmingCharacters(in: .whitespaces), content)
                            dismiss()
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
