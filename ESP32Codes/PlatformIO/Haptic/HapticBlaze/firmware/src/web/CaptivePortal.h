#pragma once

#include <DNSServer.h>
#include <IPAddress.h>

namespace hapticblaze::web {

// Resolves every DNS query to our AP IP. Pump() must be called from a
// reasonably frequent loop (housekeeping task is fine at 10 Hz).
class CaptivePortal {
public:
    bool begin(const IPAddress& apIp);
    void end();
    void pump();
private:
    DNSServer dns_;
    bool active_ = false;
};

} // namespace hapticblaze::web
