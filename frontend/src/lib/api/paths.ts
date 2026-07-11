/**
 * Hand-authored path typings for API endpoints NOT (yet) covered by the
 * backend's generated OpenAPI spec (`resources/gen/openapi.json` documents
 * favorites/recent/shares/trash only).
 *
 * The entries live in domain-sliced modules (`paths.files.ts`,
 * `paths.auth.ts`, `paths.admin.ts`, `paths.sharing.ts`, `paths.media.ts`),
 * built from the shape vocabulary in `paths.shared.ts` so they are
 * structurally identical to what openapi-typescript emits. This file merges
 * them into the single `ExtraPaths` export consumed by `$lib/api/index.ts`.
 *
 * When the backend annotates more handlers with utoipa, regenerate the spec
 * (`npm run generate:api`) and delete the superseded entries here.
 */

import type { AdminPaths } from './paths.admin';
import type { AuthPaths } from './paths.auth';
import type { FilesPaths } from './paths.files';
import type { MediaPaths } from './paths.media';
import type { SharingPaths } from './paths.sharing';

export type ExtraPaths = FilesPaths & AuthPaths & AdminPaths & SharingPaths & MediaPaths;
