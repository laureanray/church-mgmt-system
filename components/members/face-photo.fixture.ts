// Stand-in for an enrolment photo in stories and UI tests: a drawn silhouette,
// so no real face ships in the repository. Story-only; the app never imports it.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="rgb(222 214 206)"/>
<ellipse cx="300" cy="330" rx="130" ry="165" fill="rgb(150 120 102)"/>
<path d="M60 800c20-170 120-250 240-250s220 80 240 250z" fill="rgb(96 52 60)"/>
</svg>`;

export const SAMPLE_FACE_PHOTO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
