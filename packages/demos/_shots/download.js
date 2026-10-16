/**
 * Hand a blob to the browser as a file download. Shared by the capture save fallback (save.js)
 * and the findings export (review-mode.js).
 *
 * @param {string} name - File name; a download name cannot hold a folder.
 * @param {Blob} blob
 */
function downloadBlob(name, blob) {
    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    // Some browsers start the download asynchronously; revoking in the same tick can empty it.
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export { downloadBlob };
