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
     * @param {Object} config Configuration object
     */
    constructor(config) {
        this.config = config;
        this.setupStyles();
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
        const nextDeparture = stop === highlightStop ? 
            times.find(timeObj => timeHandler.timeToMinutes(timeObj.time) > timeHandler.timeToMinutes(currentTime))?.time : null;

        // Add individual time elements
        times.forEach(timeObj => {
            const timeElement = document.createElement("span");
            timeElement.textContent = timeObj.time;
            timeElement.setAttribute('role', 'cell');
            
            if (!timeObj.isToday) {
                timeElement.classList.add("tomorrow-time");
                timeElement.setAttribute('aria-label', `I morgon ${timeObj.time}`);
            }

            if (stop === highlightStop && timeObj.time === nextDeparture) {
                const totalMinutes = timeHandler.timeToMinutes(timeObj.time) - timeHandler.timeToMinutes(currentTime);
                const highlightClass = totalMinutes <= 10 ? "highlight-yellow" : "highlight-green";
                timeElement.classList.add(highlightClass);
                
                const timeDescription = totalMinutes <= 10 ? "Snar avgång" : "Nästa avgång";
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

        // Create rows for each stop
        Object.entries(schedule.departures || {}).forEach(([stop, times]) => {
            const row = this.createDepartureRow(stop, times, currentTime, highlightStopToUse);
            container.appendChild(row);
        });

        return container;
    }

    /**
     * Checks if an element has overflow content
     * @param {HTMLElement} element Element to check
     */
    checkOverflow(element) {
        if (element.scrollHeight > element.clientHeight) {
            element.classList.add('overflow');
            element.setAttribute('aria-label', `${element.getAttribute('aria-label')} - Scroll för mer innehåll`);
        } else {
            element.classList.remove('overflow');
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
            const observer = new MutationObserver(() => {
                timetables.forEach(table => this.checkOverflow(table));
            });
            
            observer.observe(wrapper, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }, 0);
    }
}
