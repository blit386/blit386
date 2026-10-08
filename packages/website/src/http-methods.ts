// The two methods the static site serves. Shared by every plugin that branches on them, so a
// typo in one comparison cannot silently stop a branch from being taken.
export const HTTP_GET = 'GET';
export const HTTP_HEAD = 'HEAD';

export function isGetOrHead(method: string): boolean {
    return method === HTTP_GET || method === HTTP_HEAD;
}
