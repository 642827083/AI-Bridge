import { PetSettings } from './pet-settings.js';
import { setupSettingsNavigation } from './settings-navigation.js';
import { setupNavigationPreferences } from './navigation-preferences.js';
import { Workflows } from './workflows.js';
setupSettingsNavigation();
setupNavigationPreferences();
new PetSettings();
new Workflows();
