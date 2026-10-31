import { Elysia } from 'elysia';

// Each feature owns its controller and messages; exceptions never expose driver/provider details.
export function createController(name: string, messages: { invalid: string; unavailable: string }) {
  return new Elysia({ name }).onError(({ code, status }) => {
    if (code === 'VALIDATION') return status(422, { message: messages.invalid });
    return status(503, { message: messages.unavailable });
  });
}
