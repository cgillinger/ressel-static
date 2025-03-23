/**
 * Sjöstadsfärjetrafiken Web Application - Renderer Module
 * 
 * Denna modul är ansvarig för att rendera och uppdatera användargränssnittet för
 * Sjöstadsfärjetrafiken webbapplikation. Den skapar tidtabellsvyer och hanterar
 * highlight-effekter för avgångar.
 * 
 * Versionshistorik:
 * 7.0.4 (2025-03-31) - Fixad bugg med talsyntes-knappens placering och rendering
 * 7.0.2 (2025-03-31) - Fixad bugg med alla avgångar markerade som highlight
 * 7.0.1 (2025-03-31) - Fixad bugg med global Renderer-klass
 * 7.0.0 (2025-03-28) - Förbättrad dagsbaserad hantering av "Endast avstigning"-indikatorer
 * 6.0.0 (2025-03-26) - Refaktorerad för robust hantering av "Endast avstigning", förbättrad dokumentation
 * 5.1.0 (2025-03-25) - Tagit bort passerade avgångar från visningen; nästa avgång alltid först
 * 5.0.0 (2025-03-24) - Lagt till dagsbaserad tidsidentifiering för korrekt sortering
 * 4.0.0 (2025-03-21) - Fullständig omdesign med ny JSON-struktur för dagtypshantering
 * 3.0.0 (2025-03-20) - Lagt till stöd för separata dagtyper
 * 2.4.0 (2025-03-22) - Lagt till talsyntesfunktionalitet för tillgänglighet
 * 2.0.0 (2025-01-16) - Konverterad till statisk webbmodul
 * 1.0.0 (2024-01-11) - Originalversion baserad på MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 7.0.4
 * @license MIT
 */

// Definiera Renderer som en global klass för att undvika "not defined" fel
class Renderer {
    /**
     * Initierar Renderer
     * @param {Object} config - Konfigurationsobjekt
     */
    constructor(config) {
        this.config = config;
        // Håll reda på aktiva talsyntesinstanser
        this.activeSpeechSynthesis = null;
    }

    /**
     * Skapar en huvudbehållare för applikationen
     * @returns {HTMLElement} Huvudbehållarelement
     */
    createWrapper() {
        const wrapper = document.createElement("div");
        wrapper.className = "MMM-Resseltrafiken";
        return wrapper;
    }

    /**
     * Skapar en tidtabellsvy
     * @param {Object} timetableData - Tidtabellsdata
     * @param {string} title - Tidtabellstitel
     * @param {string} subtitle - Tidtabellsundertitel
     * @param {string} highlightStop - Hållplats att markera
     * @param {Object} disembarkOnlyToday - "Endast avstigning"-tider för idag
     * @param {Object} disembarkOnlyTomorrow - "Endast avstigning"-tider för imorgon
     * @returns {HTMLElement} Tidtabellselement
     */
    createTimetable(timetableData, title, subtitle, highlightStop, disembarkOnlyToday, disembarkOnlyTomorrow) {
        const timetable = document.createElement("div");
        timetable.className = "timetable";
        
        // Lägg till titel och undertitel
        timetable.appendChild(this.createTitleSection(title, subtitle));
        
        // Kolla om det finns avgångar att visa
        if (timetableData && timetableData.departures) {
            const hasDisembarkOnlyTimes = this.hasDisembarkOnlyTimes(disembarkOnlyToday, disembarkOnlyTomorrow);
            
            // Tidrubriker
            if (this.config.maxVisibleDepartures > 0) {
                timetable.appendChild(this.createDeparturesHeader());
            }
            
            // Skapa avgångsrader för varje hållplats
            Object.entries(timetableData.departures).forEach(([stop, times]) => {
                const isHighlightedStop = stop === highlightStop;
                
                // Skapa rad för hållplatsen
                const row = this.createStopRow(stop, times, isHighlightedStop, disembarkOnlyToday, disembarkOnlyTomorrow);
                timetable.appendChild(row);
            });
            
            // Lägg till fotnot för "Endast avstigning" om aktiverat och det finns sådana tider
            if (this.config.showDisembarkOnly && hasDisembarkOnlyTimes) {
                timetable.appendChild(this.createDisembarkFootnote());
            }
        } else {
            // Om det inte finns några avgångar, visa ett meddelande
            const noData = document.createElement("div");
            noData.className = "notification warning";
            noData.textContent = "Inga avgångar tillgängliga för denna tidtabell.";
            timetable.appendChild(noData);
        }
        
        return timetable;
    }

    /**
     * Skapar titelsektionen för en tidtabell
     * @param {string} title - Huvudtitel
     * @param {string} subtitle - Undertitel
     * @returns {HTMLElement} Titelsektionselement
     */
    createTitleSection(title, subtitle) {
        const titleSection = document.createElement("div");
        titleSection.className = "title-section";
        
        const titleElement = document.createElement("div");
        titleElement.className = "title";
        titleElement.textContent = title;
        
        const subtitleElement = document.createElement("div");
        subtitleElement.className = "subtitle";
        subtitleElement.textContent = subtitle;
        
        titleSection.appendChild(titleElement);
        titleSection.appendChild(subtitleElement);
        
        return titleSection;
    }

    /**
     * Skapar ett rubrikelement för avgångstider
     * @returns {HTMLElement} Avgångsrubrikelement
     */
    createDeparturesHeader() {
        const header = document.createElement("div");
        header.className = "departures-header";
        header.textContent = "Nästa avgångar";
        return header;
    }

    /**
     * Skapar en rad för en hållplats med dess avgångstider
     * @param {string} stop - Hållplatsnamn
     * @param {Array} times - Array med tidsobjekt
     * @param {boolean} isHighlighted - Om denna hållplats ska markeras
     * @param {Object} disembarkOnlyToday - "Endast avstigning"-tider för idag
     * @param {Object} disembarkOnlyTomorrow - "Endast avstigning"-tider för imorgon
     * @returns {HTMLElement} Hållplatsradelement
     */
    createStopRow(stop, times, isHighlighted, disembarkOnlyToday, disembarkOnlyTomorrow) {
        const row = document.createElement("div");
        row.className = "row";
        if (isHighlighted) {
            row.classList.add("highlight-stop");
        }
        
        // Skapa hållplatscell
        const stopElement = document.createElement("div");
        stopElement.className = "stop";
        stopElement.textContent = stop;
        row.appendChild(stopElement);
        
        // Skapa avgångstidsceller
        const timesElement = document.createElement("div");
        timesElement.className = "times";
        
        // Om inga tider finns, visa ett meddelande
        if (!times || times.length === 0) {
            const noTimesSpan = document.createElement("span");
            noTimesSpan.textContent = "Inga avgångar";
            noTimesSpan.style.fontStyle = "italic";
            timesElement.appendChild(noTimesSpan);
        } else {
            // Skapa tidselement för varje avgång
            times.forEach((timeObj, index) => {
                const timeElement = this.createTimeElement(
                    timeObj.time, 
                    timeObj.isToday, 
                    index === 0 && isHighlighted,  // Bara markera första tiden för den markerade hållplatsen
                    this.isDisembarkOnlyTime(stop, timeObj, disembarkOnlyToday, disembarkOnlyTomorrow)
                );
                timesElement.appendChild(timeElement);
            });
        }
        
        row.appendChild(timesElement);
        
        // Lägg till talsyntes-knapp för första tiden om aktiverat och det är en markerad hållplats
        if (this.config.showSpeechSynthesis && isHighlighted && times && times.length > 0) {
            const speechButton = this.createSpeechButton(stop, times[0].time);
            // Lägg till knappen efter den första tiden
            if (timesElement.firstChild) {
                timesElement.firstChild.appendChild(speechButton);
            }
        }
        
        return row;
    }

    /**
     * Kontrollerar om en tid är markerad som "Endast avstigning"
     * @param {string} stop - Hållplatsnamn
     * @param {Object} timeObj - Tidsobjekt med .time och .isToday
     * @param {Object} disembarkOnlyToday - "Endast avstigning"-tider för idag
     * @param {Object} disembarkOnlyTomorrow - "Endast avstigning"-tider för imorgon
     * @returns {boolean} Sant om tiden är "Endast avstigning"
     */
    isDisembarkOnlyTime(stop, timeObj, disembarkOnlyToday, disembarkOnlyTomorrow) {
        if (!this.config.showDisembarkOnly) {
            return false;
        }
        
        const { time, isToday } = timeObj;
        
        if (isToday && disembarkOnlyToday && disembarkOnlyToday[stop]) {
            return disembarkOnlyToday[stop].includes(time);
        }
        
        if (!isToday && disembarkOnlyTomorrow && disembarkOnlyTomorrow[stop]) {
            return disembarkOnlyTomorrow[stop].includes(time);
        }
        
        return false;
    }

    /**
     * Skapar ett tidselement för en avgång
     * @param {string} time - Tidssträng (HH:MM)
     * @param {boolean} isToday - Om tiden är för idag
     * @param {boolean} isNextDeparture - Om detta är nästa avgång
     * @param {boolean} isDisembarkOnly - Om detta är "Endast avstigning"
     * @returns {HTMLElement} Tidselement
     */
    createTimeElement(time, isToday, isNextDeparture, isDisembarkOnly) {
        const timeElement = document.createElement("span");
        timeElement.textContent = time;
        timeElement.className = "time";
        
        // Hitta tidsskillnad för att avgöra om det är inom 10 minuter
        const [hours, minutes] = time.split(":").map(Number);
        const timeInMinutes = hours * 60 + minutes;
        
        const now = new Date();
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
        const diffMinutes = timeInMinutes - currentTimeInMinutes;
        
        // Lägg till klasser baserat på om det är morgondagens tid och nästa avgång
        if (!isToday) {
            timeElement.classList.add("tomorrow-time");
        }
        
        // Bara markera om detta är nästa avgång OCH det är för idag
        if (isNextDeparture && isToday) {
            if (diffMinutes < 10 && diffMinutes >= 0) {
                timeElement.classList.add("highlight-yellow");
            } else if (diffMinutes >= 0) {
                timeElement.classList.add("highlight-green");
            }
        }
        
        // Hantera "Endast avstigning"-indikator
        if (isDisembarkOnly) {
            timeElement.classList.add("disembark-only");
            
            const indicator = document.createElement("span");
            indicator.className = "disembark-indicator";
            indicator.textContent = "*";
            indicator.setAttribute("title", "Endast avstigning");
            indicator.setAttribute("aria-label", "Endast avstigning");
            
            timeElement.appendChild(indicator);
        }
        
        return timeElement;
    }

    /**
     * Skapar en talsyntes-knapp för att läsa upp nästa avgång
     * @param {string} stop - Hållplatsnamn
     * @param {string} time - Avgångstid
     * @returns {HTMLElement} Talsyntes-knapp
     */
    createSpeechButton(stop, time) {
        const button = document.createElement("button");
        button.className = "speech-button";
        button.innerHTML = "&#128266;"; // Högtalarsymbol
        button.setAttribute("aria-label", "Läs upp avgångstid");
        button.setAttribute("title", "Läs upp avgångstid");
        
        button.addEventListener("click", () => {
            // Stoppa eventuell pågående uppläsning
            if (this.activeSpeechSynthesis) {
                window.speechSynthesis.cancel();
                this.activeSpeechSynthesis = null;
                
                // Ta bort highlighting från andra knappar
                document.querySelectorAll('.speech-button.speaking').forEach(btn => {
                    if (btn !== button) {
                        btn.classList.remove('speaking');
                    }
                });
            }
            
            // Läs upp information om nästa avgång
            const message = `Nästa avgång från ${stop} är klockan ${time.replace(':', ' och ')}`;
            const speech = new SpeechSynthesisUtterance(message);
            speech.lang = "sv-SE";
            
            speech.onstart = () => {
                button.classList.add("speaking");
                this.activeSpeechSynthesis = speech;
            };
            
            speech.onend = () => {
                button.classList.remove("speaking");
                this.activeSpeechSynthesis = null;
            };
            
            speech.onerror = () => {
                button.classList.remove("speaking");
                this.activeSpeechSynthesis = null;
                console.error("Fel vid talsyntes");
            };
            
            window.speechSynthesis.speak(speech);
        });
        
        return button;
    }

    /**
     * Skapar en fotnot för "Endast avstigning"
     * @returns {HTMLElement} Fotnot-element
     */
    createDisembarkFootnote() {
        const footnote = document.createElement("div");
        footnote.className = "disembark-footnote";
        footnote.innerHTML = "<span>*</span> Endast avstigning";
        return footnote;
    }

    /**
     * Kontrollerar om det finns "Endast avstigning"-tider i schemat
     * @param {Object} disembarkOnlyToday - Dagens "Endast avstigning"-tider
     * @param {Object} disembarkOnlyTomorrow - Morgondagens "Endast avstigning"-tider
     * @returns {boolean} Sant om det finns "Endast avstigning"-tider
     */
    hasDisembarkOnlyTimes(disembarkOnlyToday, disembarkOnlyTomorrow) {
        if (!this.config.showDisembarkOnly) {
            return false;
        }
        
        // Kontrollera dagens "Endast avstigning"-tider
        if (disembarkOnlyToday && Object.keys(disembarkOnlyToday).length > 0) {
            for (const stop in disembarkOnlyToday) {
                if (disembarkOnlyToday[stop] && disembarkOnlyToday[stop].length > 0) {
                    return true;
                }
            }
        }
        
        // Kontrollera morgondagens "Endast avstigning"-tider
        if (disembarkOnlyTomorrow && Object.keys(disembarkOnlyTomorrow).length > 0) {
            for (const stop in disembarkOnlyTomorrow) {
                if (disembarkOnlyTomorrow[stop] && disembarkOnlyTomorrow[stop].length > 0) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Konfigurerar overflow-observatörer för bättre mobilvisning
     * @param {HTMLElement} wrapper - Huvudbehållarelement
     */
    setupOverflowObservers(wrapper) {
        // Använd IntersectionObserver för att detektera när element blir synliga/osynliga
        if ('IntersectionObserver' in window) {
            const timetables = wrapper.querySelectorAll('.timetable');
            timetables.forEach(timetable => {
                const times = timetable.querySelectorAll('.times');
                times.forEach(timeContainer => {
                    // Kontrollera om container flödar över
                    if (timeContainer.scrollWidth > timeContainer.clientWidth) {
                        timeContainer.classList.add('overflow');
                        
                        // Lägg till swiping-indikator
                        const indicator = document.createElement('div');
                        indicator.className = 'swipe-indicator';
                        indicator.innerHTML = '&#8594;'; // Höger pil
                        timeContainer.appendChild(indicator);
                        
                        // Aktivera horisontell scrollning på mobil
                        timeContainer.style.overflowX = 'auto';
                        timeContainer.style.webkitOverflowScrolling = 'touch';
                    }
                });
            });
        }
    }
}
