/**
 * Sjöstadsfärjetrafiken Web Application - Tema (mörkt/ljust)
 *
 * Laddas synkront i <head> så att ett sparat ljust tema är satt innan
 * sidan ritas första gången (annars blinkar den mörkt). Mörkt är standard.
 * Valet sparas i localStorage under egen nyckel, skild från övriga
 * inställningar, och rensas av "Återställ".
 *
 * Versionshistorik:
 * 5.8.0 - Skapad
 *
 * @author Christian Gillinger
 * @version 5.8.0
 * @license MIT
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'sjostadsfarjetrafiken_theme';
    const THEME_COLORS = { dark: '#000000', light: '#FAFAF8' };

    function normalize(theme) {
        return theme === 'light' ? 'light' : 'dark';
    }

    /** Läser sparat tema. Mörkt om inget sparats eller localStorage saknas. */
    function get() {
        try {
            return normalize(localStorage.getItem(STORAGE_KEY));
        } catch (error) {
            return 'dark';
        }
    }

    /** Sätter data-theme på <html> och uppdaterar statusfältets färg. Sparar inte. */
    function apply(theme) {
        const t = normalize(theme);
        document.documentElement.setAttribute('data-theme', t);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', THEME_COLORS[t]);
        }
        return t;
    }

    /** Sätter och sparar tema. Mörkt lagras inte alls (det är standard). */
    function set(theme) {
        const t = apply(theme);
        try {
            if (t === 'dark') {
                localStorage.removeItem(STORAGE_KEY);
            } else {
                localStorage.setItem(STORAGE_KEY, t);
            }
        } catch (error) {
            console.warn('Kunde inte spara tema:', error);
        }
        return t;
    }

    window.SjoTheme = { get: get, set: set, apply: apply, STORAGE_KEY: STORAGE_KEY };

    apply(get());
})();
