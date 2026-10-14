/**
 * Entry for the /shots gallery. Task 9 replaces this stub with the real wiring; until then it
 * proves the page is served with its data attributes and demo list in place.
 */
const status = document.getElementById('shots-status');
const demos = JSON.parse(document.getElementById('demo-list').textContent);

status.textContent = `${demos.length} demos, base ${document.body.dataset.demoBase}`;
