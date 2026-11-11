/**
 * Streamed response-body reader shared by `AudioClip` (download progress and idle timeout)
 * and the `.btfont` loader in `btfontFile.ts` (size cap).
 */

/**
 * Reads a response body stream to the end and returns its bytes in one buffer.
 *
 * `onChunk` runs after each chunk with the running byte total. When it throws, the
 * stream is canceled and the error is rethrown, so a caller can stop a download early.
 *
 * @param body - Response body stream.
 * @param onChunk - Called with the total bytes received so far, after each chunk.
 * @returns Every received byte, in order.
 */
export async function readStreamedBody(
    body: ReadableStream<Uint8Array>,
    onChunk: (totalBytes: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        totalBytes += value.byteLength;

        try {
            onChunk(totalBytes);
        } catch (error) {
            await reader.cancel();

            throw error;
        }

        chunks.push(value);
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return merged;
}
