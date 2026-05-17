#include "CaptivePortal.h"
#include <Arduino.h>

namespace hapticblaze::web {

bool CaptivePortal::begin(const IPAddress& apIp) {
    dns_.setErrorReplyCode(DNSReplyCode::NoError);
    if (!dns_.start(53, "*", apIp)) return false;
    active_ = true;
    return true;
}

void CaptivePortal::end() {
    if (!active_) return;
    dns_.stop();
    active_ = false;
}

void CaptivePortal::pump() {
    if (active_) dns_.processNextRequest();
}

} // namespace hapticblaze::web
