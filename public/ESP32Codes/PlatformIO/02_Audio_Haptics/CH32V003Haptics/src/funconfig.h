#ifndef _FUNCONFIG_H
#define _FUNCONFIG_H

// Board definition already sets CH32V003.
// Keep printf quiet unless you wire UART TX (PD5) for debugging.
#define FUNCONF_USE_DEBUGPRINTF 0
#define FUNCONF_NULL_PRINTF     1

#endif
