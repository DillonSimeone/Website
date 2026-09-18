#include "DriverFactory.h"
#include "L298NDriver.h"
#include "DRV8833Driver.h"
#include "DRV2605LDriver.h"
#include "MOSFETDriver.h"

namespace haxel::hal {

static IHapticDriver* sCurrent = nullptr;

IHapticDriver* DriverFactory::create(DriverKind kind) {
    if (sCurrent) {
        sCurrent->end();
        delete sCurrent;
        sCurrent = nullptr;
    }
    switch (kind) {
        case DriverKind::L298N:        sCurrent = new L298NDriver();    break;
        case DriverKind::MINI_HBRIDGE: sCurrent = new L298NDriver();    break; // sign-magnitude
        case DriverKind::DRV8833:      sCurrent = new DRV8833Driver();  break;
        case DriverKind::DRV2605L:     sCurrent = new DRV2605LDriver(); break;
        case DriverKind::MOSFET:       sCurrent = new MOSFETDriver();   break;
        default: sCurrent = nullptr;
    }
    return sCurrent;
}

} // namespace haxel::hal
