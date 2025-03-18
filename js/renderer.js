/**
 * Resseltrafiken Web Application - UI Renderer Module
 * 
 * Handles all DOM manipulation and UI rendering for the Resseltrafiken
 * timetable application. Creates and manages the visual representation
 * of timetables and related UI elements.
 * 
 * Version History:
 * 2.0.0 (2025-01-16) - Converted to static web module, improved accessibility
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 2.0.0
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
     * @returns {HTMLElement} Timetable container
     */
    createTimetableContainer(title, scheduleType) {
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
     * Creates a row for departure times
     * @param {string} stop Stop name
     * @param {Array} times Array of departure times
     * @param {string} currentTime Current time
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
        const container = this.createTimetableContainer(title, scheduleDisplayName);

        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + 
                          now.getMinutes().toString().padStart(2, '0');

        const highlightStopToUse = customHighlightStop || this.config.highlightStop;

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
