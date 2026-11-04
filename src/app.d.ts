declare global {
  namespace App {
    interface Locals {
      authenticated: boolean;
      language: import('./lib/i18n/index.ts').Language;
    }
  }
}
export {};
