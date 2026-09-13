/// <reference path="../.astro/types.d.ts" />
/// <reference types="@tutorialkit/astro/types" />
/// <reference types="astro/client" />
declare const __FORGE_URL__: string;
declare module '@forge/api' { export function sendMentorTurnStream(slug: string, body: unknown, onEvent: (event: unknown) => void, student?: string): Promise<any>; }
declare module '@forge/bootstrap' { export function establishOwnerSession(): Promise<{ kind: string }>; }
declare module '@tutorialkit-webcontainer' { export const tutorialStore: import('@tutorialkit/runtime').TutorialStore; }
