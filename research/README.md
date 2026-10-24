# Research project pages

Standalone project pages for the personal homepage, covering source posters/reports, their background, method, complete numbered figure sets, results, conclusions, and references. A short results summary precedes the full content and section navigation. No build step or external runtime is required. Equations use the locally bundled KaTeX distribution, including its license.

## Source material

PTA (`PTA_CGW/website`):

- Text: `src/content/results.ts`, `other.ts`, and `figures.ts`; interpretation checked against `AUDIT.md`.
- `public/assets/fig-5.png` → `pta/assets/localization-gain.png`.
- `public/assets/fig-7.png` → `pta/assets/gw-parameter-space.png`.
- Other numbered figures map to `pta-concept.png` (1), `ionosphere.jpeg` (2), `astrometry-pipeline.png` (3), `parallax-forecasts.png` (4), `host-candidates.jpeg` (6), `anchor-substitution.jpeg` (8), and `anchor-contribution.png` (9).
- `frequency-bands.png` and `fig-4-legend.png` are included as ancillary illustrations.
- `public/assets/conference-poster.pdf` → `pta/assets/conference-poster.pdf`.
- The approximate poster core-count comparison (50 → 25 at 300 MHz, versus 20–30 at 1600 MHz) is attributed to the poster and accompanied by the audit's unresolved catalog/cut/aperture issues. It is not presented as an independently reproduced statistic.
- Relative localization gain is distinguished from absolute precision; calibration scenarios retain a measurement floor. Original figure assets and numbering are preserved. The Fig. 7 sign typo is corrected in the HTML explanation.

Asteroid (`Asteroid_Agent_KPC/Asteroid_Agent_KPC/site`):

- Text: English results in `index.html`, with implementation context from `pipeline-verification.md`.
- `assets/fig3-error-distributions.png` → `asteroid/assets/reconstruction-errors.png`.
- `assets/fig7-pca-modes-lightcurves.png` → `asteroid/assets/shape-degeneracy.png`.
- Other copied numbered figures map to `observing-geometry.png` (1), `reconstruction-examples.png` (4), `geometry-dependence.png` (5), and `higher-order-sensitivity.png` (8).
- Figures 2 and 6 are rendered directly from the original poster PDF at 2× resolution, using PyMuPDF with point bounds `(105, 1110, 1145, 1715)` and `(1260, 795, 2290, 1095)`. The source website's pipeline raster does not reproduce the visible poster diagram correctly, so it is not used.
- `assets/26Fall_KAS_PSS02_Lee.pdf` → `asteroid/assets/conference-poster.pdf`.
- The medians 0.0514 and 0.0632 describe sample-mean and worst-lightcurve target-amplitude RMSE for best recovered states, not shape errors. PCA-panel NRMSE is treated separately.
- The poster's illustrative NRMSE table, feasible-family definitions, PCA subspace, finite-amplitude expansion, caveats, future work, and five references are included. The implementation note avoids a strict descent or global-optimality guarantee.

Black holes (`PH471/RayTracing Report.pdf`):

- The existing project title, **Black-Hole Ray Tracing and VLBI Imaging**, is preserved. An **Ongoing project** badge and current-stage note explain that report figures cover ray tracing while the VLBI extension remains in progress.
- The five-page PDF is copied unchanged to `black-hole/assets/ray-tracing-report.pdf`, SHA256 `f23e12e58a8112d6b4fcaef98e1d5bef3771b8290a49630b2c2a8729488aa5ba`.
- Figures 1, 3, 4, and 5 are bounded 4× PDF renderings preserving their multi-panel layout: page 1 `(302, 438, 559, 549)`; page 3 `(36, 16, 293, 237)` and `(302, 16, 559, 349)`; page 4 `(36, 16, 293, 349)`. Coordinates are PDF points; page numbers are one-based.
- Figures 2 and 6 are extracted directly from embedded image objects 2 and 21 as `redshift-map.png` and `null-validation.png`.
- The page includes geodesic integration, emission/redshift mapping, Schwarzschild scales, Kerr spin/inclination comparisons, all six numbered figures, null-condition validation, ongoing work, and the report's five bibliography entries.
- Numerical null residuals are attributed to the report and distinguished from image accuracy. Ring visibility is described as a qualitative interpretation within the specified optically thick disk model. The prose states the prograde ISCO trend without reproducing the report's ambiguous printed ISCO expression.

The original research folders and supplied report are read-only inputs and are not modified by this integration.

## CV update and navigation

- Biography, education, research periods, internship details, honors, academic activities, coursework, and presentation listings are updated from `HakjinLee_CV (26.10.16).pdf`. The CV dates the ObsCAL individual study to June 2025–June 2026 and the URP to June 2026–present.
- The asteroid page's opening banner attributes the October 2026 Korean Astronomical Society Fall Meeting Excellence Award to this research (PSS02), as stated in the CV.
- The existing black-hole project title and ongoing status remain; its sidebar label is **GRRT** on all academic pages.
- Shared `page-transitions.js` and `main_style.css` provide native same-document and cross-document transitions, with a brief content fade/slide and stationary header/sidebar. Reduced-motion preferences disable the effect; same-document navigation has a Web Animations fallback.

## Decorative title artwork

Title backgrounds use caption-free document extracts rather than the captioned scientific panels. PTA uses the poster's embedded map image (object 37, `hero-figure.jpeg`). GRRT uses only the disk-image interior from report page 2, bounds `(353.5, 180.5, 490.5, 317.5)` at 6x. Asteroid uses the colored Mode 1 negative-perturbation shape inset from poster page 1, bounds `(1815, 1200, 1910, 1300)` at 5x (`hero-pca-shape.png`). These decorative extracts are hidden from assistive technology; numbered figures and their captions remain unchanged in the main content.
