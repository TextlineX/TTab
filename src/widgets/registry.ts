import type { BuiltinWidget } from './types';
import { searchWidget } from './builtins/Search';
import { todoWidget } from './builtins/Todo';
import { notesWidget } from './builtins/Notes';
import { topSitesWidget } from './builtins/TopSites';
import { clockWidget } from './builtins/Clock';
import { countdownWidget } from './builtins/Countdown';
import { weatherWidget } from './builtins/Weather';

export const BUILTIN_WIDGETS = [searchWidget, todoWidget, notesWidget, topSitesWidget, clockWidget, countdownWidget, weatherWidget] as unknown as BuiltinWidget[];

export const getBuiltin = (type: string) => BUILTIN_WIDGETS.find(w => w.type === type);
