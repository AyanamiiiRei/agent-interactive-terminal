export class SessionError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = 'SessionError';
        this.code = code;
    }
}
//# sourceMappingURL=errors.js.map