export class DomainError extends Error {
	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export class NotFoundError extends DomainError {}

export class ConflictError extends DomainError {}
