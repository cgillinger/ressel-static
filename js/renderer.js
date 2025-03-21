/**
 * Resseltrafiken Web Application - UI Renderer Module
 * 
 * Handles all DOM manipulation and UI rendering for the Resseltrafiken
 * timetable application. Creates and manages the visual representation
 * of timetables and related UI elements.
 * 
 * Version History:
 * 4.0.0 (2025-03-21) - Updated for new JSON structure with separate day types
 * 2.4.0 (2025-03-22) - Added speech synthesis feature for accessibility
 * 2.0.0 (2025-01-16) - Converted to static web module, improved accessibility
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 4.0.0
 * @license MIT
 */

class Renderer {
    /**
     * Initializes the Renderer with configuration
     * @param {Object} config Configuration object containing displayOptions
     */
    constructor(config) {
        this.config = config;
        this.setupStyles();
        
        // Bind methods to ensure proper 'this' context
        this.createWrapper = this.createWrapper.bind(this);
        this.createTimetable = this.createTimetable.bind(this);
        this.setupOverflowObservers = this.setupOverflowObservers.bind(this);
        this.createSpeechButton = this.createSpeechButton.bind(this);
        this.speakNextDeparture = this.speakNextDeparture.bind(this);
    }

    /**
     * Sets up CSS variables for dynamic styling
     * @private
     */
    setupStyles() {
        document.documentElement.style.setProperty('--visible-departures', this.config.maxVisibleDepartures);
    }

    /**
     * Creates the main wrapper element
     * @returns {HTMLElement} The wrapper element
     */
    createWrapper() {
        const wrapper = document.createElement("div");
        wrapper.className = "MMM-Resseltrafiken";
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Resseltrafiken tidtabeller');
        return wrapper;
    }

    /**
     * Creates a notification element
     * @param {HTMLElement} wrapper Parent element
     * @param {string} message Notification message
     * @param {string} type Notification type (warning, error, etc.)
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
     * Creates a timetable container with header
     * @param {string} title Timetable title
     * @param {string} scheduleType Schedule type (weekday/weekend)
     * @param {string} highlightStop Stop that is highlighted
     * @returns {HTMLElement} Timetable container
     */
    createTimetableContainer(title, scheduleType, highlightStop) {
        const container = document.createElement("div");
        container.className = "timetable";
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', `${title} - ${scheduleType}`);

        // Create title section
        const titleSection = document.createElement("div");
        titleSection.className = "title-section";

        const titleElement = document.createElement("div");
        titleElement.className = "title";
        titleElement.setAttribute('role', 'heading');
        titleElement.setAttribute('aria-level', '1');
        
        // Add text
        const titleText = document.createElement("span");
        titleText.textContent = title;
        titleElement.appendChild(titleText);
        
        // Add boat icon
        const icon = document.createElement("img");
        icon.src = "icons/boat.png";
        icon.alt = "Båtikon";
        icon.setAttribute('role', 'presentation');
        icon.setAttribute('width', '50');
        icon.setAttribute('height', '50');
        titleElement.appendChild(icon);
        
        titleSection.appendChild(titleElement);
        
        // Add speech button if enabled
        if (this.config.showSpeechSynthesis) {
            const speechButton = this.createSpeechButton(title, highlightStop);
            titleSection.appendChild(speechButton);
        }
        
        container.appendChild(titleSection);

        // Add departures header
        const departuresHeader = document.createElement("div");
        departuresHeader.className = "departures-header";
        departuresHeader.textContent = "Avgångar";
        departuresHeader.setAttribute('role', 'heading');
        departuresHeader.setAttribute('aria-level', '2');
        container.appendChild(departuresHeader);

        return container;
    }
    
    /**
     * Creates a speech synthesis button for the timetable
     * @param {string} title Timetable title
     * @param {string} highlightStop Stop that is highlighted
     * @returns {HTMLElement} Speech button
     */
    createSpeechButton(title, highlightStop) {
        const speechButton = document.createElement("button");
        speechButton.className = "speech-button";
        speechButton.innerHTML = '🔊';
        speechButton.setAttribute('aria-label', `Läs upp nästa avgång från ${highlightStop}`);
        speechButton.setAttribute('title', `Läs upp nästa avgång från ${highlightStop}`);
        speechButton.setAttribute('data-stop', highlightStop);
        speechButton.setAttribute('data-title', title);
        
        // Använd en data-attribut för att spåra aktiv status
        speechButton.setAttribute('data-speaking', 'false');
        
        speechButton.addEventListener('click', () => {
            this.speakNextDeparture(speechButton);
        });
        
        return speechButton;
    }
    
    /**
     * Speaks the next departure using the Web Speech API
     * @param {HTMLElement} button The speech button that was clicked
     */
    speakNextDeparture(button) {
        // Om talsyntes redan pågår, avbryt den
        if (window.speechSynthesis.speaking && button.getAttribute('data-speaking') === 'true') {
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
        
        // Förbered meddelandet
        let message;
        
        if (isTomorrow) {
            message = `Nästa avgång från ${stop} är imorgon klockan ${time}.`;
        } else {
            // Kontrollera om det är en snar avgång (gul markering)
            if (nextDeparture.classList.contains('highlight-yellow')) {
                message = `Snar avgång från ${stop} klockan ${time}.`;
            } else {
                message = `Nästa avgång från ${stop} är klockan ${time}.`;
            }
        }
        
        // Läs upp meddelandet
        this.speakMessage(message, button);
    }
    
    /**
     * Uses the Web Speech API to speak a message
     * @param {string} message Message to speak
     * @param {HTMLElement} button The button that triggered the speech (for visual feedback)
     */
    speakMessage(message, button = null) {
        // Kontrollera om talsyntes stöds av webbläsaren
        if (!('speechSynthesis' in window)) {
            console.error('Din webbläsare stödjer inte talsyntes.');
            return;
        }
        
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
    }

    /**
     * Creates a row for departure times
     * @param {string} stop Stop name
     * @param {Array} times Array of departure times with format {time: "HH:MM", isToday: boolean}
     * @param {string} currentTime Current time in HH:MM format
     * @param {string} highlightStop Stop to highlight
     * @returns {HTMLElement} Row element
     */
    createDepartureRow(stop, times, currentTime, highlightStop) {
        const row = document.createElement("div");
        row.className = "row";
        row.setAttribute('role', 'row');
        
        if (stop === highlightStop) {
            row.classList.add("highlight-stop");
        }

        // Create stop name element
        const stopElement = document.createElement("div");
        stopElement.className = "stop";
        stopElement.textContent = stop;
        stopElement.setAttribute('role', 'cell');
        row.appendChild(stopElement);

        // Create times container
        const timesElement = document.createElement("div");
        timesElement.className = "times";
        timesElement.setAttribute('role', 'row');

        // Find next departure for highlighted stop
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

        // Add individual time elements
        times.forEach(timeObj => {
            const timeElement = document.createElement("span");
            timeElement.textContent = timeObj.time;
            timeElement.setAttribute('role', 'cell');
            timeElement.setAttribute('tabindex', '0');
            
            if (!timeObj.isToday) {
                timeElement.classList.add("tomorrow-time");
                timeElement.setAttribute('aria-label', `I morgon ${timeObj.time}`);
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
                
                timeElement.setAttribute('aria-label', `${timeDescription} ${timeObj.time}`);
            }

            timesElement.appendChild(timeElement);
        });

        row.appendChild(timesElement);
        return row;
    }

    /**
     * Creates a complete timetable
     * @param {Object} schedule Schedule data
     * @param {string} title Timetable title
     * @param {string} scheduleDisplayName Display name for schedule type
     * @param {string} customHighlightStop Optional stop to highlight
     * @returns {HTMLElement} Complete timetable element
     */
    createTimetable(schedule, title, scheduleDisplayName, customHighlightStop = null) {
        const highlightStopToUse = customHighlightStop || this.config.highlightStop;
        
        const container = this.createTimetableContainer(title, scheduleDisplayName, highlightStopToUse);

        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + 
                          now.getMinutes().toString().padStart(2, '0');

        try {
            // Create rows for each stop
            Object.entries(schedule.departures || {}).forEach(([stop, times]) => {
                const row = this.createDepartureRow(stop, times, currentTime, highlightStopToUse);
                container.appendChild(row);
            });
        } catch (error) {
            console.error('Error creating timetable rows:', error);
            this.createNotification(container, 'Kunde inte visa alla avgångar', 'error');
        }

        return container;
    }

    /**
     * Checks if an element has overflow content
     * @param {HTMLElement} element Element to check
     */
    checkOverflow(element) {
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
    }

    /**
     * Sets up overflow observers for dynamic content
     * @param {HTMLElement} wrapper Root element to observe
     */
    setupOverflowObservers(wrapper) {
        // Delay to ensure content is rendered
        setTimeout(() => {
            const timetables = wrapper.querySelectorAll('.timetable');
            timetables.forEach(table => this.checkOverflow(table));
            
            // Create observer for dynamic changes
            const observer = new ResizeObserver(entries => {
                entries.forEach(entry => {
                    if (entry.target.classList.contains('timetable')) {
                        this.checkOverflow(entry.target);
                    }
                });
            });
            
            // Observe each timetable
            timetables.forEach(table => observer.observe(table));
            
            // Clean up observer when wrapper is removed
            const cleanup = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.removedNodes.forEach(node => {
                        if (node === wrapper) {
                            observer.disconnect();
                            cleanup.disconnect();
                        }
                    });
                });
            });
            
            cleanup.observe(wrapper.parentNode, { childList: true });
        }, 0);
    }
}