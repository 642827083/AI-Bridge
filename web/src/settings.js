import { setupSettingsNavigation } from './settings-navigation.js';
import { setupNavigationPreferences } from './navigation-preferences.js';
import { setupAboutLinks } from './about-links.js';
import { Workflows } from './workflows.js';
setupSettingsNavigation();
setupNavigationPreferences();
setupAboutLinks();
new Workflows();
