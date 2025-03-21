/**
 * Sjöstadsfärjetrafiken Web Application - Main Application
 * 
 * This is the main entry point and controller for the Sjöstadsfärjetrafiken web application.
 * It coordinates the TimeHandler and Renderer modules, manages data loading and updates,
 * and handles the overall application lifecycle.
 * 
 * Version History:
 * 2.3.1 (2025-03-21) - Fixed visibility of direction settings, replaced toggles with settings panel
 * 2.2.1 (2025-03-20) - Fixed toggle controls visibility logic
 * 2.2.0 (2025-03-19) - Added options to show/hide individual timetables
 * 2.1.0 (2025-03-18) - Added support for seasonal timetables
 * 2.0.0 (2025-01-16) - Converted to static web application
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 2.3.1
 * @license MIT
 */

document.addEventListener('DOMContentLoaded', async function() {
    /**
     * Application configuration object
     * @type {Object}
     */
    const config = {
        updateInterval: 60000,           // Update interval in milliseconds
        showBothDirections: true,        // Show both outbound and return trips
        showSjostadstrafiken: true,      // Show Sjöstadstrafiken timetable
        showEmelietrafiken: true,        // Show Emelietrafiken (M/S Emelie) timetable
        highlightStop: "Lumabryggan",    // Stop to highlight in the UI
        cityHighlightStop: "Lumabryggan", // Stop to highlight for city line (to city)
        cityReturnStop: "Nybroplan",     // Return stop to highlight for city direction
        maxVisibleDepartures: 9,         // Maximum number of visible departures per stop
        dataPaths: {                     // Paths to timetable data 
            sjo: './data/ressel-sjo.json',
            city: './data/ressel-city.json',
            citySpring: './data/ressel-city-spring-2025.json' // Spring timetable for 2025
        },
        debug: false                     // Enable debug logging
    };

    // Try to load config from URL parameters if they exist
    loadConfigFromURL();
    
    // Try to load config from localStorage if they exist
    loadConfigFromLocalStorage();

    let timetableData = {
        sjo: null,
        city: null
    };
    const timeHandler = new TimeHandler();
    const renderer = new Renderer(config);
    
    // Keep a reference to the settings panel
    let settingsPanel = null;

    /**
     * Loads configuration from localStorage
     * This preserves user preferences between sessions
     */
    function loadConfigFromLocalStorage() {
        try {
            // Only load if localStorage is available and we have saved settings
            if (localStorage && localStorage.getItem('sjostadsfarjetrafiken_settings')) {
                const savedSettings = JSON.parse(localStorage.getItem('sjostadsfarjetrafiken_settings'));
                
                // Apply saved settings if they exist, but don't override URL parameters
                if (savedSettings.showSjostadstrafiken !== undefined && !urlHasParam('sjo')) {
                    config.showSjostadstrafiken = savedSettings.showSjostadstrafiken;
                }
                
                if (savedSettings.showEmelietrafiken !== undefined && !urlHasParam('emelie')) {
                    config.showEmelietrafiken = savedSettings.showEmelietrafiken;
                }
                
                if (savedSettings.showBothDirections !== undefined && !urlHasParam('bothdir')) {
                    config.showBothDirections = savedSettings.showBothDirections;
                }
                
                if (savedSettings.maxVisibleDepartures !== undefined && !urlHasParam('maxdep')) {
                    config.maxVisibleDepartures = savedSettings.maxVisibleDepartures;
                    // Update CSS variable
                    document.documentElement.style.setProperty('--visible-departures', savedSettings.maxVisibleDepartures);
                }
                
                if (savedSettings.highlightStop !== undefined && !urlHasParam('highlight')) {
                    config.highlightStop = savedSettings.highlightStop;
                }
                
                if (savedSettings.cityHighlightStop !== undefined && !urlHasParam('cityhighlight')) {
                    config.cityHighlightStop = savedSettings.cityHighlightStop;
                }
                
                if (savedSettings.cityReturnStop !== undefined && !urlHasParam('returnstop')) {
                    config.cityReturnStop = savedSettings.cityReturnStop;
                }
            }
        } catch (error) {
            console.warn('Could not load settings from localStorage:', error);
        }
    }
    
    /**
     * Checks if a URL parameter exists
     * @param {string} paramName - Parameter name to check
     * @returns {boolean} True if parameter exists in URL
     */
    function urlHasParam(paramName) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has(paramName);
    }
    
    /**
     * Saves current configuration to localStorage
     */
    function saveConfigToLocalStorage() {
        try {
            if (localStorage) {
                const settings = {
                    showSjostadstrafiken: config.showSjostadstrafiken,
                    showEmelietrafiken: config.showEmelietrafiken,
                    showBothDirections: config.showBothDirections,
                    maxVisibleDepartures: config.maxVisibleDepartures,
                    highlightStop: config.highlightStop,
                    cityHighlightStop: config.cityHighlightStop,
                    cityReturnStop: config.cityReturnStop
                };
                
                localStorage.setItem('sjostadsfarjetrafiken_settings', JSON.stringify(settings));
            }
        } catch (error) {
            console.warn('Could not save settings to localStorage:', error);
        }
    }

    /**
     * Loads configuration from URL parameters
     * This allows for easy customization of display without editing code
     */
    function loadConfigFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Check for show/hide parameters
        if (urlParams.has('sjo')) {
            config.showSjostadstrafiken = urlParams.get('sjo') === '1' || 
                                          urlParams.get('sjo') === 'true';
        }
        
        if (urlParams.has('emelie')) {
            config.showEmelietrafiken = urlParams.get('emelie') === '1' || 
                                        urlParams.get('emelie') === 'true';
        }
        
        // Check for highlight stop parameters
        if (urlParams.has('highlight')) {
            config.highlightStop = decodeURIComponent(urlParams.get('highlight'));
        }
        
        if (urlParams.has('cityhighlight')) {
            config.cityHighlightStop = decodeURIComponent(urlParams.get('cityhighlight'));
        }
        
        if (urlParams.has('returnstop')) {
            config.cityReturnStop = decodeURIComponent(urlParams.get('returnstop'));
        }
        
        // Check for direction setting
        if (urlParams.has('bothdir')) {
            config.showBothDirections = urlParams.get('bothdir') === '1' || 
                                        urlParams.get('bothdir') === 'true';
        }
        
        // Check for maxVisibleDepartures
        if (urlParams.has('maxdep')) {
            const maxDep = parseInt(urlParams.get('maxdep'), 10);
            if (!isNaN(maxDep) && maxDep > 0 && maxDep <= 20) {
                config.maxVisibleDepartures = maxDep;
                // Update CSS variable
                document.documentElement.style.setProperty('--visible-departures', maxDep);
            }
        } else {
            // Set default based on screen size if not specified in URL
            setDefaultDeparturesBasedOnScreenSize();
        }
    }
    
    /**
     * Sets default number of visible departures based on screen size
     */
    function setDefaultDeparturesBasedOnScreenSize() {
        // Only set default if not already set in localStorage
        if (localStorage && !localStorage.getItem('sjostadsfarjetrafiken_settings')) {
            // Check if mobile (<768px)
            if (window.innerWidth < 768) {
                config.maxVisibleDepartures = 4;
                document.documentElement.style.setProperty('--visible-departures', 4);
            } else {
                // Desktop default stays at 9
                config.maxVisibleDepartures = 9;
                document.documentElement.style.setProperty('--visible-departures', 9);
            }
        }
    }

    /**
     * Logs debug messages if debug mode is enabled
     * @param {string} message - Message to log
     * @param {*} [data] - Optional data to log
     */
    function debugLog(message, data = null) {
        if (config.debug) {
            console.log(`[Sjöstadsfärjetrafiken] ${message}`, data || '');
        }
    }

    /**
     * Determines which timetable file to use based on the current date
     * @returns {Object} An object with the paths to use for each service
     */
    function determineTimeTablePaths() {
        const now = new Date();
        const paths = {
            sjo: config.dataPaths.sjo,
            city: config.dataPaths.city
        };

        // Spring timetable for M/S Emelie (April 22 - June 19, 2025)
        const springStart = new Date('2025-04-22T00:00:00');
        const springEnd = new Date('2025-06-20T00:00:00'); // End date is inclusive

        if (now >= springStart && now < springEnd) {
            debugLog('Using Spring 2025 timetable for Emelietrafiken');
            paths.city = config.dataPaths.citySpring;
        }

        return paths;
    }

    /**
     * Loads and validates the timetable data
     * @returns {Promise<Object>} The parsed and validated timetable data
     * @throws {Error} If data cannot be loaded or is invalid
     */
    async function loadTimetableData() {
        try {
            debugLog('Loading timetable data...');
            
            // Determine which timetable files to use
            const paths = determineTimeTablePaths();
            debugLog('Using timetable paths:', paths);

            // Load both JSON files
            const [sjoResponse, cityResponse] = await Promise.all([
                fetch(paths.sjo),
                fetch(paths.city)
            ]);
            
            if (!sjoResponse.ok || !cityResponse.ok) {
                throw new Error(`HTTP error! status: ${sjoResponse.status} / ${cityResponse.status}`);
            }

            const sjoData = await sjoResponse.json();
            const cityData = await cityResponse.json();

            validateTimetableData(sjoData, cityData);
            debugLog('Timetable data loaded successfully');
            
            return {
                sjo: sjoData,
                city: cityData
            };
        } catch (error) {
            console.error('Error loading timetable:', error);
            handleError(error, 'Kunde inte ladda tidtabellsdata');
            return null;
        }
    }

    /**
     * Validates the structure and content of timetable data
     * @param {Object} sjoData - The Sjöstadstrafiken timetable data
     * @param {Object} cityData - The City Line timetable data
     * @throws {Error} If data structure is invalid
     */
    function validateTimetableData(sjoData, cityData) {
        if (!sjoData.metadata || !cityData.metadata) {
            throw new Error('Ogiltig datastruktur i tidtabellen');
        }

        // Validate version and period for both services
        const now = new Date();
        
        // Validate Sjöstadstrafiken period
        const sjoValidFrom = new Date(sjoData.metadata.valid_period.start);
        const sjoValidTo = new Date(sjoData.metadata.valid_period.end);
        
        // Validate City Line period
        const cityValidFrom = new Date(cityData.metadata.valid_period.start);
        const cityValidTo = new Date(cityData.metadata.valid_period.end);
        
        if (now > sjoValidTo || now > cityValidTo) {
            console.warn('Varning: Tidtabellsdata kan vara inaktuell');
        }

        debugLog('Data validation complete', {
            sjo: {
                version: sjoData._metadata?.version || 'Unknown',
                validPeriod: `${sjoValidFrom.toLocaleDateString()} - ${sjoValidTo.toLocaleDateString()}`
            },
            city: {
                version: cityData._metadata?.version || 'Unknown',
                validPeriod: `${cityValidFrom.toLocaleDateString()} - ${cityValidTo.toLocaleDateString()}`
            }
        });
    }

    /**
     * Updates the display with current timetable information
     * @param {Object} timetable - The current timetable data
     */
    function updateDisplay(timetable) {
        const appElement = document.getElementById('app');
        if (!appElement) {
            console.error('App container not found');
            return;
        }

        appElement.innerHTML = '';
        const wrapper = renderer.createWrapper();

        if (!timetable || !timetable.sjo || !timetable.city) {
            handleError(null, 'Ingen tidtabellsdata tillgänglig');
            return;
        }

        try {
            debugLog('Updating display...');
            const scheduleType = timeHandler.getScheduleType(timetable);
            
            // Add timetable validity information
            addValidityInfo(wrapper, timetable);
            
            // First render timetables
            renderTimetables(wrapper, timetable, scheduleType);
            
            // Then add settings button if not in embedded mode
            if (!isEmbedded()) {
                addSettingsButton(wrapper);
            }
            
            renderer.setupOverflowObservers(wrapper);
            appElement.appendChild(wrapper);
            debugLog('Display update complete');
        } catch (error) {
            handleError(error, 'Fel vid uppdatering av display');
        }
    }

    /**
     * Checks if the app is running in an embedded mode
     * @returns {boolean} True if app is embedded
     */
    function isEmbedded() {
        return window.location.search.includes('embedded=true');
    }

    /**
     * Adds settings button that opens the settings panel
     * @param {HTMLElement} wrapper - The container element
     */
    function addSettingsButton(wrapper) {
        const settingsButton = document.createElement('div');
        settingsButton.className = 'settings-button';
        settingsButton.setAttribute('role', 'button');
        settingsButton.setAttribute('tabindex', '0');
        settingsButton.setAttribute('aria-label', 'Öppna inställningar');
        
        const hamburgerIcon = document.createElement('span');
        hamburgerIcon.className = 'hamburger-icon';
        hamburgerIcon.innerHTML = '&#9776;'; // Unicode for hamburger icon
        
        const buttonText = document.createElement('span');
        buttonText.className = 'settings-button-text';
        buttonText.textContent = 'Inställningar';
        
        settingsButton.appendChild(hamburgerIcon);
        settingsButton.appendChild(buttonText);
        
        settingsButton.addEventListener('click', () => {
            openSettingsPanel();
        });
        
        settingsButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                openSettingsPanel();
                e.preventDefault();
            }
        });
        
        wrapper.appendChild(settingsButton);
    }
    
    /**
     * Opens the settings panel
     */
    function openSettingsPanel() {
        // If panel already exists, remove it first
        if (settingsPanel) {
            settingsPanel.remove();
            settingsPanel = null;
            return;
        }
        
        // Create the settings panel
        settingsPanel = document.createElement('div');
        settingsPanel.className = 'settings-panel';
        settingsPanel.setAttribute('role', 'dialog');
        settingsPanel.setAttribute('aria-labelledby', 'settings-title');
        
        // Panel header
        const panelHeader = document.createElement('div');
        panelHeader.className = 'settings-header';
        
        const panelTitle = document.createElement('h2');
        panelTitle.id = 'settings-title';
        panelTitle.textContent = 'Inställningar';
        
        const closeButton = document.createElement('button');
        closeButton.className = 'settings-close-button';
        closeButton.innerHTML = '&times;'; // × symbol
        closeButton.setAttribute('aria-label', 'Stäng inställningar');
        closeButton.addEventListener('click', () => {
            closeSettingsPanel();
        });
        
        panelHeader.appendChild(panelTitle);
        panelHeader.appendChild(closeButton);
        settingsPanel.appendChild(panelHeader);
        
        // Panel content
        const panelContent = document.createElement('div');
        panelContent.className = 'settings-content';
        
        // Add Tidtabeller section
        panelContent.appendChild(createSettingsSection('Tidtabeller', [
            {
                type: 'toggle',
                id: 'sjo-toggle',
                label: 'Sjöstadstrafiken',
                checked: config.showSjostadstrafiken,
                onChange: (checked) => {
                    config.showSjostadstrafiken = checked;
                    updateDisplay(timetableData);
                    updateURLParameter('sjo', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            },
            {
                type: 'toggle',
                id: 'emelie-toggle',
                label: 'M/S Emelie',
                checked: config.showEmelietrafiken,
                onChange: (checked) => {
                    config.showEmelietrafiken = checked;
                    
                    // Toggle visibility of the directions section
                    const directionsSection = document.getElementById('emelie-directions-section');
                    if (directionsSection) {
                        directionsSection.style.display = checked ? 'block' : 'none';
                    }
                    
                    updateDisplay(timetableData);
                    updateURLParameter('emelie', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // Add M/S Emelie - Riktningar section
        const directionsSection = createSettingsSection('M/S Emelie - Riktningar', [
            {
                type: 'toggle',
                id: 'bothdir-toggle',
                label: 'Visa båda riktningar (till/från City)',
                checked: config.showBothDirections,
                onChange: (checked) => {
                    config.showBothDirections = checked;
                    updateDisplay(timetableData);
                    updateURLParameter('bothdir', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]);
        directionsSection.id = 'emelie-directions-section';
        directionsSection.style.display = config.showEmelietrafiken ? 'block' : 'none';
        panelContent.appendChild(directionsSection);
        
        // Add Visning section
        panelContent.appendChild(createSettingsSection('Visning', [
            {
                type: 'select',
                id: 'maxdep-select',
                label: 'Antal avgångar:',
                value: config.maxVisibleDepartures,
                options: Array.from({length: 13}, (_, i) => i + 3).map(num => ({
                    value: num,
                    text: num.toString()
                })),
                onChange: (value) => {
                    const numValue = parseInt(value, 10);
                    config.maxVisibleDepartures = numValue;
                    document.documentElement.style.setProperty('--visible-departures', numValue);
                    updateDisplay(timetableData);
                    updateURLParameter('maxdep', numValue.toString());
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // Add Bryggval för Sjöstadstrafiken section if data is available
        if (timetableData && timetableData.sjo && timetableData.sjo.schedules) {
            const sjoStops = Object.keys(timetableData.sjo.schedules.weekday.departures || {});
            if (sjoStops.length > 0) {
                panelContent.appendChild(createSettingsSection('Bryggval för Sjöstadstrafiken', [
                    {
                        type: 'select',
                        id: 'highlight-select',
                        label: 'Markera brygga:',
                        value: config.highlightStop,
                        options: sjoStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.highlightStop = value;
                            updateDisplay(timetableData);
                            updateURLParameter('highlight', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    }
                ]));
            }
        }
        
        // Add Bryggval för M/S Emelie section if data is available
        if (timetableData && timetableData.city && timetableData.city.service_configuration) {
            const cityStops = timetableData.city.service_configuration.stop_sequence?.to_city || [];
            const fromCityStops = timetableData.city.service_configuration.stop_sequence?.from_city || [];
            
            if (cityStops.length > 0 && fromCityStops.length > 0) {
                panelContent.appendChild(createSettingsSection('Bryggval för M/S Emelie', [
                    {
                        type: 'select',
                        id: 'cityhighlight-select',
                        label: 'Till City:',
                        value: config.cityHighlightStop,
                        options: cityStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.cityHighlightStop = value;
                            updateDisplay(timetableData);
                            updateURLParameter('cityhighlight', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    },
                    {
                        type: 'select',
                        id: 'returnstop-select',
                        label: 'Från City:',
                        value: config.cityReturnStop,
                        options: fromCityStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.cityReturnStop = value;
                            updateDisplay(timetableData);
                            updateURLParameter('returnstop', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    }
                ]));
            }
        }
        
        settingsPanel.appendChild(panelContent);
        
        // Add panel footer with close button
        const panelFooter = document.createElement('div');
        panelFooter.className = 'settings-footer';
        
        const closeSettingsButton = document.createElement('button');
        closeSettingsButton.className = 'settings-button-close';
        closeSettingsButton.textContent = 'Stäng';
        closeSettingsButton.addEventListener('click', () => {
            closeSettingsPanel();
        });
        
        panelFooter.appendChild(closeSettingsButton);
        settingsPanel.appendChild(panelFooter);
        
        // Add panel to document
        document.body.appendChild(settingsPanel);
        
        // Add overlay
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.addEventListener('click', () => {
            closeSettingsPanel();
        });
        document.body.appendChild(overlay);
        
        // Focus the first interactive element for accessibility
        setTimeout(() => {
            const firstToggle = settingsPanel.querySelector('input[type="checkbox"], select');
            if (firstToggle) {
                firstToggle.focus();
            }
        }, 100);
        
        // Add animation class after a tiny delay to trigger transition
        setTimeout(() => {
            settingsPanel.classList.add('open');
            overlay.classList.add('visible');
        }, 10);
    }
    
    /**
     * Closes the settings panel
     */
    function closeSettingsPanel() {
        if (settingsPanel) {
            settingsPanel.classList.remove('open');
            
            const overlay = document.querySelector('.settings-overlay');
            if (overlay) {
                overlay.classList.remove('visible');
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }
            
            // Wait for animation to complete before removing from DOM
            setTimeout(() => {
                if (settingsPanel) {
                    settingsPanel.remove();
                    settingsPanel = null;
                }
            }, 300);
        }
    }
    
    /**
     * Creates a settings section with a title and items
     * @param {string} title - Section title
     * @param {Array<Object>} items - Setting items configuration
     * @returns {HTMLElement} The settings section element
     */
    function createSettingsSection(title, items) {
        const section = document.createElement('div');
        section.className = 'settings-group';
        
        const sectionTitle = document.createElement('h3');
        sectionTitle.className = 'settings-group-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        items.forEach(item => {
            let settingItem;
            
            if (item.type === 'toggle') {
                settingItem = createToggleSetting(item.id, item.label, item.checked, item.onChange);
            } else if (item.type === 'select') {
                settingItem = createSelectSetting(
                    item.id, 
                    item.label, 
                    item.value, 
                    item.options, 
                    item.onChange
                );
            }
            
            if (settingItem) {
                section.appendChild(settingItem);
            }
        });
        
        return section;
    }
    
    /**
     * Creates a toggle setting element
     * @param {string} id - Element ID
     * @param {string} label - Setting label
     * @param {boolean} initialState - Initial toggle state
     * @param {Function} onChange - Change handler
     * @returns {HTMLElement} The toggle setting element
     */
    function createToggleSetting(id, label, initialState, onChange) {
        const container = document.createElement('div');
        container.className = 'setting-item toggle-container';
        
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = id;
        toggleInput.checked = initialState;
        toggleInput.addEventListener('change', (e) => onChange(e.target.checked));
        
        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = id;
        toggleLabel.textContent = label;
        
        container.appendChild(toggleInput);
        container.appendChild(toggleLabel);
        return container;
    }
    
    /**
     * Creates a select setting element
     * @param {string} id - Element ID
     * @param {string} label - Setting label
     * @param {string|number} initialValue - Initial selected value
     * @param {Array<Object>} options - Select options {value, text}
     * @param {Function} onChange - Change handler
     * @returns {HTMLElement} The select setting element
     */
    function createSelectSetting(id, label, initialValue, options, onChange) {
        const container = document.createElement('div');
        container.className = 'setting-item select-container';
        
        const selectLabel = document.createElement('label');
        selectLabel.htmlFor = id;
        selectLabel.textContent = label;
        
        const select = document.createElement('select');
        select.id = id;
        select.className = 'settings-select';
        
        options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.value;
            optElement.textContent = option.text;
            
            if (option.value == initialValue) { // Loose equality check for number/string comparison
                optElement.selected = true;
            }
            
            select.appendChild(optElement);
        });
        
        select.addEventListener('change', (e) => onChange(e.target.value));
        
        container.appendChild(selectLabel);
        container.appendChild(select);
        return container;
    }

    /**
     * Updates a URL parameter without refreshing the page
     * @param {string} key - Parameter name
     * @param {string} value - Parameter value
     */
    function updateURLParameter(key, value) {
        const url = new URL(window.location);
        url.searchParams.set(key, value);
        window.history.replaceState({}, '', url);
    }

    /**
     * Adds timetable validity information to the display
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     */
    function addValidityInfo(wrapper, timetable) {
        const cityData = timetable.city;
        
        if (cityData.metadata && cityData.metadata.valid_period) {
            const validFrom = new Date(cityData.metadata.valid_period.start);
            const validTo = new Date(cityData.metadata.valid_period.end);
            
            const infoElement = document.createElement("div");
            infoElement.className = "validity-info";
            infoElement.innerHTML = `Aktuell tidtabell gäller: ${validFrom.toLocaleDateString('sv-SE')} - ${validTo.toLocaleDateString('sv-SE')}`;
            wrapper.appendChild(infoElement);
        }
    }

    /**
     * Renders all timetables for the current schedule
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - The current schedule type (weekday/weekend)
     */
    function renderTimetables(wrapper, timetable, scheduleType) {
        const scheduleDisplayName = timeHandler.getScheduleDisplayName(scheduleType);

        // Render Sjöstadstrafiken schedules if enabled
        if (config.showSjostadstrafiken) {
            renderSjostadsTimetable(wrapper, timetable.sjo, scheduleType, scheduleDisplayName);
        }

        // Render Emelietrafiken schedules if enabled
        if (config.showEmelietrafiken) {
            renderEmelieTimetables(wrapper, timetable.city, scheduleType, scheduleDisplayName);
        }
        
        // If no timetables are visible, show a message
        if (!config.showSjostadstrafiken && !config.showEmelietrafiken) {
            const noDataMessage = document.createElement("div");
            noDataMessage.className = "notification warning";
            noDataMessage.textContent = "Inga tidtabeller valda att visa. Aktivera minst en tidtabell från inställningarna.";
            noDataMessage.setAttribute('role', 'alert');
            wrapper.appendChild(noDataMessage);
        }
    }

    /**
     * Renders Sjöstadstrafiken timetable
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - Current schedule type
     * @param {string} scheduleDisplayName - Display name for schedule type
     */
    function renderSjostadsTimetable(wrapper, timetable, scheduleType, scheduleDisplayName) {
        const sjoStadsSchedule = timetable.schedules[scheduleType].departures;
        if (sjoStadsSchedule) {
            const processedDepartures = {};
            for (const [stop, times] of Object.entries(sjoStadsSchedule)) {
                processedDepartures[stop] = timeHandler.processScheduleTimes(
                    times, 
                    config.maxVisibleDepartures
                );
            }

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedDepartures },
                    "Sjöstadstrafiken",
                    scheduleDisplayName,
                    config.highlightStop
                )
            );
        }
    }

    /**
     * Merges morning, lunch and afternoon departures for city line
     * @param {Object} schedule - Schedule containing different time periods
     * @returns {Object} Merged departures
     */
    function mergeCityLineDepartures(schedule) {
        const mergedDepartures = {};
        
        // Helper function to process departures
        const processDepartures = (departures) => {
            if (!departures) return;
            Object.entries(departures).forEach(([stop, times]) => {
                if (!mergedDepartures[stop]) {
                    mergedDepartures[stop] = [];
                }
                mergedDepartures[stop].push(...times);
            });
        };

        // Process morning departures if they exist
        if (schedule.morning && schedule.morning.departures) {
            processDepartures(schedule.morning.departures);
        }

        // Process lunch departures if they exist (added in Spring 2025 schedule)
        if (schedule.lunch && schedule.lunch.departures) {
            processDepartures(schedule.lunch.departures);
        }

        // Process afternoon departures if they exist
        if (schedule.afternoon && schedule.afternoon.departures) {
            processDepartures(schedule.afternoon.departures);
        }

        // Sort times for each stop
        Object.keys(mergedDepartures).forEach(stop => {
            mergedDepartures[stop].sort();
        });

        return mergedDepartures;
    }

    /**
     * Process weekend schedule based on day of week (Saturday/Sunday)
     * Special handling for spring 2025 timetable which has separate weekend schedules
     * @param {Object} timetable - The timetable data
     * @param {string} direction - Direction (to_city or from_city)
     * @returns {Object} The processed weekend schedule
     */
    function processWeekendSchedule(timetable, direction) {
        // Check if timetable has separate weekend schedules for Saturday and Sunday
        if (timetable.schedules.weekend.saturday && timetable.schedules.weekend.sunday) {
            // Spring 2025 format with separate day schedules
            const now = new Date();
            const isSaturday = now.getDay() === 6;
            
            return isSaturday 
                ? timetable.schedules.weekend.saturday[direction].departures
                : timetable.schedules.weekend.sunday[direction].departures;
        }
        
        // Standard format with combined weekend schedule
        return timetable.schedules.weekend[direction].departures;
    }

    /**
     * Renders Emelietrafiken timetables
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - Current schedule type
     * @param {string} scheduleDisplayName - Display name for schedule type
     */
    function renderEmelieTimetables(wrapper, timetable, scheduleType, scheduleDisplayName) {
        if (scheduleType === 'weekday') {
            const toCity = mergeCityLineDepartures(timetable.schedules.weekday.to_city);
            const fromCity = mergeCityLineDepartures(timetable.schedules.weekday.from_city);

            // Process outbound route (to city)
            const processedToCity = {};
            Object.entries(toCity).forEach(([stop, times]) => {
                processedToCity[stop] = timeHandler.processScheduleTimes(
                    times,
                    config.maxVisibleDepartures
                );
            });

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedToCity },
                    "M/S Emelie → City",
                    scheduleDisplayName,
                    config.cityHighlightStop 
                )
            );

            // Render return route if configured
            if (config.showBothDirections) {
                const processedFromCity = {};
                Object.entries(fromCity).forEach(([stop, times]) => {
                    processedFromCity[stop] = timeHandler.processScheduleTimes(
                        times,
                        config.maxVisibleDepartures
                    );
                });

                wrapper.appendChild(
                    renderer.createTimetable(
                        { departures: processedFromCity },
                        "M/S Emelie ← City",
                        scheduleDisplayName,
                        config.cityReturnStop
                    )
                );
            }
        } else {
            // Weekend schedule handling
            const toCity = processWeekendSchedule(timetable, 'to_city');
            const fromCity = processWeekendSchedule(timetable, 'from_city');

            // Process and render outbound route
            const processedToCity = {};
            Object.entries(toCity).forEach(([stop, times]) => {
                processedToCity[stop] = timeHandler.processScheduleTimes(
                    times,
                    config.maxVisibleDepartures
                );
            });

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedToCity },
                    "M/S Emelie → City",
                    scheduleDisplayName,
                    config.cityHighlightStop
                )
            );

            // Render return route if configured
            if (config.showBothDirections) {
                const processedFromCity = {};
                Object.entries(fromCity).forEach(([stop, times]) => {
                    processedFromCity[stop] = timeHandler.processScheduleTimes(
                        times,
                        config.maxVisibleDepartures
                    );
                });

                wrapper.appendChild(
                    renderer.createTimetable(
                        { departures: processedFromCity },
                        "M/S Emelie ← City",
                        scheduleDisplayName,
                        config.cityReturnStop
                    )
                );
            }
        }
    }

    /**
     * Handles and displays errors to the user
     * @param {Error} error - The error object
     * @param {string} message - User-friendly error message
     */
    function handleError(error, message) {
        console.error('Application error:', error);
        const appElement = document.getElementById('app');
        const wrapper = renderer.createWrapper();
        wrapper.innerHTML = `
            <div class="notification error" role="alert">
                ${message}
            </div>
        `;
        appElement.appendChild(wrapper);
    }

    /**
     * Starts periodic updates of the display
     * @param {Object} timetable - The timetable data
     */
    function startPeriodicUpdates(timetable) {
        setInterval(() => {
            try {
                debugLog('Running periodic update');
                
                // Check if we need to reload timetable data (e.g., day change)
                const now = new Date();
                const paths = determineTimeTablePaths();
                const currentCityPath = paths.city;
                
                // If timetable has changed, reload it
                if (currentCityPath !== lastLoadedCityPath) {
                    debugLog('Timetable changed, reloading data');
                    loadTimetableData().then(newData => {
                        if (newData) {
                            timetableData = newData;
                            lastLoadedCityPath = currentCityPath;
                            updateDisplay(timetableData);
                        }
                    });
                } else {
                    // Just update the display with current data
                    updateDisplay(timetable);
                }
            } catch (error) {
                handleError(error, 'Kunde inte uppdatera tidtabellen');
            }
        }, config.updateInterval);
    }

    // Track which timetable was last loaded
    let lastLoadedCityPath = '';

    // Initialize the application
    try {
        debugLog('Initializing application...');
        
        // Determine initial timetable paths
        const initialPaths = determineTimeTablePaths();
        lastLoadedCityPath = initialPaths.city;
        
        // Load initial data
        timetableData = await loadTimetableData();
        
        if (timetableData) {
            // Perform first display update
            updateDisplay(timetableData);
            
            // Start periodic updates
            startPeriodicUpdates(timetableData);
            
            debugLog('Application initialized successfully');
        }
    } catch (error) {
        handleError(error, 'Kunde inte starta applikationen');
    }
});