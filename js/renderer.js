/**
 * Resseltrafiken Web Application - UI Renderer Module
 * 
 * Hanterar all DOM-manipulation och UI-rendering för Resseltrafiken
 * tidtabellsapplikation. Skapar och hanterar visuell representation
 * av tidtabeller och relaterade UI-element.
 * 
 * Versionshistorik:
 * 7.1.0 (2025-03-29) - Fixat så fotnot bara visas när det faktiskt finns "Endast avstigning"-tider
 * 7.0.0 (2025-03-28) - Fixad dagsbaserad hantering av "Endast avstigning"-indikatorer 
 * 6.0.0 (2025-03-28) - Fixat MutationObserver-fel, förbättrad felhantering
 * 5.0.0 (2025-03-26) - Standardiserad hantering av "Endast avstigning", förbättrad tillgänglighet
 * 4.0.0 (2025-03-21) - Uppdaterad för ny JSON-struktur med separata dagtyper
 * 2.4.0 (2025-03-22) - Lagt till talsyntes-funktion för tillgänglighet
 * 2.0.0 (2025-01-16) - Konverterad till statisk webbmodul, förbättrad tillgänglighet
 * 1.0.0 (2024-01-11) - Originalversion baserad på MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 7.1.0
 * @license MIT
 */

class Renderer {
    /**
     * Initierar Renderaren med konfiguration
     * @param {Object} config Konfigurationsobjekt innehållande displayOptions
     */
    constructor(config) {
        this.config = config;
        this.setupStyles();
        
        // Binder metoder för att säkerställa korrekt 'this'-kontext
        this.createWrapper = this.createWrapper.bind(this);
        this.createTimetable = this.createTimetable.bind(this);
        this.setupOverflowObservers = this.setupOverflowObservers.bind(this);
        this.createSpeechButton = this.createSpeechButton.bind(this);
        this.speakNextDeparture = this.speakNextDeparture.bind(this);
    }

    /**
     * Sätter upp CSS-variabler för dynamisk styling
     * @private
     */
    setupStyles() {
        document.documentElement.style.setProperty('--visible-departures', this.config.maxVisibleDepartures);
    }

    /**
     * Skapar huvudwrapper-elementet
     * @returns {HTMLElement} Wrapper-elementet
     */
    createWrapper() {
        const wrapper = document.createElement("div");
        wrapper.className = "MMM-Resseltrafiken";
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Resseltrafiken tidtabeller');
        return wrapper;
    }

    /**
     * Skapar ett notifikationselement
     * @param {HTMLElement} wrapper Förälderelement
     * @param {string} message Notifikationsmeddelande
     * @param {string} type Notifikationstyp (warning, error, etc.)
     */
    createNotification(wrapper, message, type) {
        const notification = document.createElement("div");
        notification.className = `notification ${type}`;
        notification.setAttribute('role', 'alert');
        notification.setAttribute('aria-live', 'polite');
        notification.innerHTML = message;
        wrapper.appendChild(notification);
    }

    /**
     * Skapar en tidtabellsbehållare med rubrik
     * @param {string} title Tidtabellens titel
     * @param {string} scheduleType Schematyp (weekday/weekend)
     * @param {string} highlightStop Hållplats som ska markeras
     * @returns {HTMLElement} Tidtabellsbehållare
     */
    createTimetableContainer(title, scheduleType, highlightStop) {
        const container = document.createElement("div");
        container.className = "timetable";
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', `${title} - ${scheduleType}`);

        // Skapa titelsektion
        const titleSection = document.createElement("div");
        titleSection.className = "title-section";

        const titleElement = document.createElement("div");
        titleElement.className = "title";
        titleElement.setAttribute('role', 'heading');
        titleElement.setAttribute('aria-level', '1');
        
        // Lägg till text
        const titleText = document.createElement("span");
        titleText.textContent = title;
        titleElement.appendChild(titleText);
        
        // Lägg till båtikon
        const icon = document.createElement("img");
        icon.src = "icons/boat.png";
        icon.alt = "Båtikon";
        icon.setAttribute('role', 'presentation');
        icon.setAttribute('width', '50');
        icon.setAttribute('height', '50');
        titleElement.appendChild(icon);
        
        titleSection.appendChild(titleElement);
        
        // Lägg till talknapp om aktiverad
        if (this.config.showSpeechSynthesis) {
            const speechButton = this.createSpeechButton(title, highlightStop);
            titleSection.appendChild(speechButton);
        }
        
        container.appendChild(titleSection);

        // Lägg till avgångsrubrik
        const departuresHeader = document.createElement("div");
        departuresHeader.className = "departures-header";
        departuresHeader.textContent = "Avgångar";
        departuresHeader.setAttribute('role', 'heading');
        departuresHeader.setAttribute('aria-level', '2');
        container.appendChild(departuresHeader);

        return container;
    }
    
    /**
     * Skapar en talsyntes-knapp för tidtabellen
     * @param {string} title Tidtabellens titel
     * @param {string} highlightStop Hållplats som ska markeras
     * @returns {HTMLElement} Talknapp
     */
    createSpeechButton(title, highlightStop) {
        const speechButton = document.createElement("button");
        speechButton.className = "speech-button";
        speechButton.innerHTML = '🔊';
        speechButton.setAttribute('aria-label', `Läs upp nästa avgång från ${highlightStop}`);
        speechButton.setAttribute('title', `Läs upp nästa avgång från ${highlightStop}`);
        speechButton.setAttribute('data-stop', highlightStop);
        speechButton.setAttribute('data-title', title);
        
        // Använd ett data-attribut för att spåra aktiv status
        speechButton.setAttribute('data-speaking', 'false');
        
        speechButton.addEventListener('click', () => {
            this.speakNextDeparture(speechButton);
        });
        
        return speechButton;
    }
    
    /**
     * Läser upp nästa avgång med Web Speech API
     * @param {HTMLElement} button Talknappen som klickades
     */
    speakNextDeparture(button) {
        // Om talsyntes redan pågår, avbryt den
        if (window.speechSynthesis && window.speechSynthesis.speaking && 
            button.getAttribute('data-speaking') === 'true') {
            window.speechSynthesis.cancel();
            button.setAttribute('data-speaking', 'false');
            button.classList.remove('speaking');
            return;
        }
        
        const stop = button.getAttribute('data-stop');
        const title = button.getAttribute('data-title');
        
        // Hitta tidtabellen som innehåller den markerade hållplatsen
        const timetable = button.closest('.timetable');
        if (!timetable) return;
        
        // Hitta raden för den markerade hållplatsen
        const highlightedRow = timetable.querySelector('.highlight-stop');
        if (!highlightedRow) {
            this.speakMessage(`Ingen markerad hållplats hittades för ${title}.`);
            return;
        }
        
        // Hitta nästa avgång (element med klass highlight-green eller highlight-yellow)
        const nextDeparture = highlightedRow.querySelector('.highlight-green, .highlight-yellow');
        if (!nextDeparture) {
            this.speakMessage(`Inga fler avgångar idag från ${stop}.`, button);
            return;
        }
        
        // Kontrollera om avgången är för idag eller imorgon
        const isTomorrow = nextDeparture.classList.contains('tomorrow-time');
        const time = nextDeparture.textContent.trim();
        
        // Kontrollera om avgången är "Endast avstigning"
        const isDisembarkOnly = nextDeparture.classList.contains('disembark-only');
        
        // Förbered meddelandet
        let message;
        
        if (isTomorrow) {
            message = `Nästa avgång från ${stop} är imorgon klockan ${time}.`;
            if (isDisembarkOnly) {
                message += " Observera, endast avstigning.";
            }
        } else {
            // Kontrollera om det är en snar avgång (gul markering)
            if (nextDeparture.classList.contains('highlight-yellow')) {
                message = `Snar avgång från ${stop} klockan ${time}.`;
                if (isDisembarkOnly) {
                    message += " Observera, endast avstigning.";
                }
            } else {
                message = `Nästa avgång från ${stop} är klockan ${time}.`;
                if (isDisembarkOnly) {
                    message += " Observera, endast avstigning.";
                }
            }
        }
        
        // Läs upp meddelandet
        this.speakMessage(message, button);
    }
    
    /**
     * Använder Web Speech API för att läsa upp ett meddelande
     * @param {string} message Meddelande att läsa upp
     * @param {HTMLElement} button Knappen som utlöste uppläsningen (för visuell feedback)
     */
    speakMessage(message, button = null) {
        // Kontrollera om talsyntes stöds av webbläsaren
        if (!('speechSynthesis' in window)) {
            console.error('Din webbläsare stödjer inte talsyntes.');
            return;
        }
        
        try {
            // Avbryt eventuell pågående uppläsning
            window.speechSynthesis.cancel();
            
            // Skapa ett nytt Speech Synthesis Utterance-objekt
            const utterance = new SpeechSynthesisUtterance(message);
            
            // Försök använda svenska som språk
            utterance.lang = 'sv-SE';
            utterance.rate = 0.9; // Lite långsammare för tydlighet
            utterance.pitch = 1;
            
            // Visuell feedback när uppläsningen börjar
            if (button) {
                button.classList.add('speaking');
                button.setAttribute('data-speaking', 'true');
                button.setAttribute('aria-label', 'Avbryt uppläsning');
                
                // Återställ knappens utseende när uppläsningen är klar
                utterance.onend = () => {
                    button.classList.remove('speaking');
                    button.setAttribute('data-speaking', 'false');
                    button.setAttribute('aria-label', `Läs upp nästa avgång från ${button.getAttribute('data-stop')}`);
                };
                
                // Hantera avbruten uppläsning
                utterance.onpause = utterance.onend;
                utterance.onerror = utterance.onend;
            }
            
            // Starta uppläsningen
            window.speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn('Fel vid användning av talsyntes:', error);
            if (button) {
                button.classList.remove('speaking');
                button.setAttribute('data-speaking', 'false');
            }
        }
    }

    /**
     * Skapar en rad för avgångstider
     * @param {string} stop Hållplatsnamn
     * @param {Array} times Array med avgångstider i format {time: "HH:MM", isToday: boolean}
     * @param {string} currentTime Aktuell tid i HH:MM-format
     * @param {string} highlightStop Hållplats att markera
     * @param {Object} disembarkOnlyInfo Objekt med dagens och morgondagens "Endast avstigning" tider
     * @returns {HTMLElement} Rad-element
     */
    createDepartureRow(stop, times, currentTime, highlightStop, disembarkOnlyInfo = null) {
        const row = document.createElement("div");
        row.className = "row";
        row.setAttribute('role', 'row');
        
        if (stop === highlightStop) {
            row.classList.add("highlight-stop");
        }

        // Skapa hållplatsnamnselement
        const stopElement = document.createElement("div");
        stopElement.className = "stop";
        stopElement.textContent = stop;
        stopElement.setAttribute('role', 'cell');
        row.appendChild(stopElement);

        // Skapa tidsbehållare
        const timesElement = document.createElement("div");
        timesElement.className = "times";
        timesElement.setAttribute('role', 'row');

        // Hitta nästa avgång för markerad hållplats
        const timeHandler = new TimeHandler();
        const currentTimeMinutes = timeHandler.timeToMinutes(currentTime);
        
        // Hitta nästa avgång, antingen idag eller imorgon
        let nextDepartureObj = null;
        if (stop === highlightStop) {
            // Först leta efter nästa avgång som är från idag
            nextDepartureObj = times.find(timeObj => 
                timeObj.isToday && 
                timeHandler.timeToMinutes(timeObj.time) > currentTimeMinutes
            );
            
            // Om ingen avgång hittades idag, ta den första avgången imorgon
            if (!nextDepartureObj) {
                nextDepartureObj = times.find(timeObj => !timeObj.isToday);
            }
        }

        // Förbereda disembarkOnly-objekt
        const todayDisembarkOnly = disembarkOnlyInfo?.today || null;
        const tomorrowDisembarkOnly = disembarkOnlyInfo?.tomorrow || null;

        // Lägg till individuella tidselement
        times.forEach(timeObj => {
            const timeElement = document.createElement("span");
            timeElement.textContent = timeObj.time;
            timeElement.setAttribute('role', 'cell');
            timeElement.setAttribute('tabindex', '0');
            
            // Bestäm vilket disembarkOnly-objekt att använda baserat på om tiden är för idag eller morgondagen
            const disembarkOnlyTimes = timeObj.isToday ? todayDisembarkOnly : tomorrowDisembarkOnly;
            
            // Kontrollera om denna tid är "Endast avstigning"
            const isDisembarkOnly = this.isDisembarkOnlyTime(stop, timeObj.time, disembarkOnlyTimes);
            
            if (isDisembarkOnly) {
                // Lägg till markering för "Endast avstigning" (om den ska visas)
                if (this.config.showDisembarkOnly) {
                    timeElement.classList.add("disembark-only");
                    // Lägg till asterisk eller annan indikator för "Endast avstigning"
                    const indicator = document.createElement("span");
                    indicator.className = "disembark-indicator";
                    indicator.textContent = "*";
                    indicator.setAttribute('aria-hidden', 'true');
                    timeElement.appendChild(indicator);
                }
                
                // Lägg alltid till en tooltip och ARIA-attribut för tillgänglighet
                timeElement.setAttribute('title', 'Endast avstigning');
                timeElement.setAttribute('aria-label', `${timeObj.time} - Endast avstigning`);
            }
            
            if (!timeObj.isToday) {
                timeElement.classList.add("tomorrow-time");
                
                // Uppdatera ARIA-label baserat på om det är "Endast avstigning" eller inte
                if (isDisembarkOnly) {
                    timeElement.setAttribute('aria-label', `I morgon ${timeObj.time} - Endast avstigning`);
                } else {
                    timeElement.setAttribute('aria-label', `I morgon ${timeObj.time}`);
                }
            }

            // Markera nästa avgång med grön eller gul ram
            if (stop === highlightStop && nextDepartureObj && timeObj.time === nextDepartureObj.time && timeObj.isToday === nextDepartureObj.isToday) {
                let totalMinutes;
                
                if (timeObj.isToday) {
                    // För dagens avgångar - beräkna minuter från nu till avgång
                    totalMinutes = timeHandler.timeToMinutes(timeObj.time) - currentTimeMinutes;
                } else {
                    // För morgondagens avgångar - räkna med att den är mer än 10 minuter bort
                    totalMinutes = 24 * 60 + timeHandler.timeToMinutes(timeObj.time) - currentTimeMinutes;
                }
                
                const highlightClass = totalMinutes <= 10 ? "highlight-yellow" : "highlight-green";
                timeElement.classList.add(highlightClass);
                
                // Anpassa tillgänglighetsbeskrivningen
                let timeDescription;
                if (!timeObj.isToday) {
                    timeDescription = "Morgondagens första avgång";
                } else {
                    timeDescription = totalMinutes <= 10 ? "Snar avgång" : "Nästa avgång";
                }
                
                // Uppdatera ARIA-label baserat på om det är "Endast avstigning" eller inte
                if (isDisembarkOnly) {
                    timeElement.setAttribute('aria-label', `${timeDescription} ${timeObj.time} - Endast avstigning`);
                } else {
                    timeElement.setAttribute('aria-label', `${timeDescription} ${timeObj.time}`);
                }
            }

            timesElement.appendChild(timeElement);
        });

        row.appendChild(timesElement);
        return row;
    }

    /**
     * Kontrollerar om en specifik tid för en specifik hållplats är "Endast avstigning"
     * @param {string} stop Hållplatsnamn
     * @param {string} time Tid i format "HH:MM"
     * @param {Object} disembarkOnlyTimes Objekt med "Endast avstigning" tider
     * @returns {boolean} True om tiden är "Endast avstigning"
     */
    isDisembarkOnlyTime(stop, time, disembarkOnlyTimes) {
        if (!disembarkOnlyTimes) return false;
        
        // Kontrollera om hållplatsen finns i disembarkOnlyTimes
        if (disembarkOnlyTimes[stop]) {
            return disembarkOnlyTimes[stop].includes(time);
        }
        
        return false;
    }

    /**
     * Kontrollerar om det finns några "Endast avstigning"-tider i ett objekt
     * @param {Object} disembarkOnlyObj Objekt med "Endast avstigning" tider
     * @returns {boolean} True om det finns minst en "Endast avstigning"-tid
     */
    hasDisembarkOnlyTimes(disembarkOnlyObj) {
        if (!disembarkOnlyObj) return false;
        
        // Kontrollera om objektet har några hållplatser med tider
        for (const stop in disembarkOnlyObj) {
            if (Array.isArray(disembarkOnlyObj[stop]) && disembarkOnlyObj[stop].length > 0) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Skapar en komplett tidtabell
     * @param {Object} schedule Schemalagda data
     * @param {string} title Tidtabellstitel
     * @param {string} scheduleDisplayName Visningsnamn för schematypen
     * @param {string} customHighlightStop Valfri hållplats att markera
     * @param {Object} disembarkOnlyToday Objekt med dagens "Endast avstigning" tider
     * @param {Object} disembarkOnlyTomorrow Objekt med morgondagens "Endast avstigning" tider
     * @returns {HTMLElement} Komplett tidtabellselement
     */
    createTimetable(schedule, title, scheduleDisplayName, customHighlightStop = null, disembarkOnlyToday = null, disembarkOnlyTomorrow = null) {
        const highlightStopToUse = customHighlightStop || this.config.highlightStop;
        
        const container = this.createTimetableContainer(title, scheduleDisplayName, highlightStopToUse);

        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + 
                          now.getMinutes().toString().padStart(2, '0');

        // Kombinera dagens och morgondagens "Endast avstigning"-tider i ett objekt
        const disembarkOnlyInfo = {
            today: disembarkOnlyToday,
            tomorrow: disembarkOnlyTomorrow
        };

        try {
            // Skapa rader för varje hållplats
            Object.entries(schedule.departures || {}).forEach(([stop, times]) => {
                const row = this.createDepartureRow(stop, times, currentTime, highlightStopToUse, disembarkOnlyInfo);
                container.appendChild(row);
            });
            
            // Kontrollera om det faktiskt finns några "Endast avstigning"-tider att visa
            const hasAnyDisembarkOnlyTimes = 
                (this.hasDisembarkOnlyTimes(disembarkOnlyToday) || 
                 this.hasDisembarkOnlyTimes(disembarkOnlyTomorrow)) && 
                this.config.showDisembarkOnly;
            
            // Lägg bara till fotnot om det faktiskt finns "Endast avstigning"-tider och showDisembarkOnly är aktiverat
            if (hasAnyDisembarkOnlyTimes) {
                const footnote = document.createElement("div");
                footnote.className = "disembark-footnote";
                footnote.innerHTML = "<span>*</span> = Endast avstigning";
                container.appendChild(footnote);
            }
        } catch (error) {
            console.error('Error creating timetable rows:', error);
            this.createNotification(container, 'Kunde inte visa alla avgångar', 'error');
        }

        return container;
    }

    /**
     * Kontrollerar om ett element har overflow-innehåll
     * @param {HTMLElement} element Element att kontrollera
     */
    checkOverflow(element) {
        if (!element) return;
        
        try {
            if (element.scrollHeight > element.clientHeight) {
                element.classList.add('overflow');
                const currentLabel = element.getAttribute('aria-label') || '';
                if (!currentLabel.includes('Scroll för mer innehåll')) {
                    element.setAttribute('aria-label', `${currentLabel} - Scroll för mer innehåll`);
                }
            } else {
                element.classList.remove('overflow');
                const currentLabel = element.getAttribute('aria-label') || '';
                element.setAttribute('aria-label', currentLabel.replace(' - Scroll för mer innehåll', ''));
            }
        } catch (error) {
            console.warn('Fel vid kontroll av overflow:', error);
        }
    }

    /**
     * Sätter upp overflow-observatörer för dynamiskt innehåll
     * @param {HTMLElement} wrapper Rotelementet att observera
     */
    setupOverflowObservers(wrapper) {
        // Säkerhetskontroll
        if (!wrapper) {
            console.warn('setupOverflowObservers: Inget wrapper-element tillhandahållet');
            return;
        }
        
        // Använd setTimeout för att undvika MutationObserver-problem
        setTimeout(() => {
            try {
                // Kontrollera att wrapper fortfarande finns i DOM
                if (!document.body.contains(wrapper)) {
                    console.warn('Wrapper finns inte längre i DOM');
                    return;
                }
                
                // Hitta och kontrollera tidtabeller
                const timetables = wrapper.querySelectorAll('.timetable');
                if (timetables.length === 0) {
                    console.warn('Inga tidtabeller hittades i wrapper');
                    return;
                }
                
                // Kontrollera överflöde för varje tidtabell
                timetables.forEach(table => {
                    if (table) {
                        this.checkOverflow(table);
                    }
                });
                
                // Skapa en ResizeObserver för att upptäcka storleksändringar
                try {
                    // ResizeObserver-stöd kontroll
                    if (typeof ResizeObserver === 'undefined') {
                        console.warn('ResizeObserver stöds inte i denna webbläsare');
                        return;
                    }
                    
                    const resizeObserver = new ResizeObserver(entries => {
                        entries.forEach(entry => {
                            try {
                                if (entry.target && entry.target.classList && 
                                    entry.target.classList.contains('timetable')) {
                                    this.checkOverflow(entry.target);
                                }
                            } catch (error) {
                                console.warn('Fel i ResizeObserver-callback:', error);
                            }
                        });
                    });
                    
                    // Observera varje tidtabell
                    timetables.forEach(table => {
                        if (table) {
                            resizeObserver.observe(table);
                        }
                    });
                    
                    // Lösning: Använd ett attribut på wrapper för att lagra referensen 
                    // till observatören istället för att använda MutationObserver
                    wrapper.setAttribute('data-has-observers', 'true');
                    wrapper._resizeObserver = resizeObserver;
                    
                    // Städa upp på window unload istället för MutationObserver
                    window.addEventListener('unload', () => {
                        if (resizeObserver) {
                            resizeObserver.disconnect();
                        }
                    });
                } catch (error) {
                    console.warn('Fel vid skapande av ResizeObserver:', error);
                }
            } catch (error) {
                console.warn('Fel vid uppsättning av overflow observers:', error);
            }
        }, 200); // Längre timeout för att säkerställa att DOM är helt renderad
    }
}