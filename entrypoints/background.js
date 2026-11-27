import { registerBackgroundListeners } from '../src/background/backgroundRuntime.ts';

export default defineBackground({
  type: 'module',
  main() {
    registerBackgroundListeners();
  },
});
