(function () {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const page = file === "" ? "index.html" : file;

    const links = [
        ["index.html", "Home"],
        ["access.html", "Event access"],
        ["goods.html", "Made goods"],
        ["computers.html", "Computers"],
        ["work.html", "Work"],
        ["about.html", "About"]
    ];

    const header = document.getElementById("site-header");
    if (header) {
        const items = links.map(function (item) {
            const current = item[0] === page ? ' aria-current="page"' : "";
            return '<li><a href="' + item[0] + '"' + current + ">" + item[1] + "</a></li>";
        }).join("");

        header.innerHTML =
            '<div class="site-header-inner">' +
                '<a class="wordmark" href="index.html"><span class="wordmark-mark" aria-hidden="true"></span>Maximize Your Tech</a>' +
                '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>' +
                '<ul class="nav-links" id="site-nav">' +
                    items +
                    '<li><a class="button" href="contact.html#quote">Request a quote</a></li>' +
                "</ul>" +
            "</div>";

        const toggle = header.querySelector(".nav-toggle");
        const nav = header.querySelector(".nav-links");
        toggle.addEventListener("click", function () {
            const open = nav.classList.toggle("is-open");
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });
    }

    const footer = document.getElementById("site-footer");
    if (footer) {
        footer.innerHTML =
            '<div class="site-footer-inner">' +
                "<div>" +
                    "<h2>Shop</h2>" +
                    "<p>Maximize Your Tech, LLC<br>560 Mc Call Way<br>Philomath, OR</p>" +
                    '<p><a href="mailto:mayan.fogarty@maximizeyourtech.com">mayan.fogarty@maximizeyourtech.com</a></p>' +
                "</div>" +
                "<div>" +
                    "<h2>Hours</h2>" +
                    '<ul class="hours">' +
                        "<li><span>Mon–Thu</span><span>9:00 a.m.–3:00 p.m.</span></li>" +
                        "<li><span>Fri</span><span>9:00 a.m.–12:00 p.m.</span></li>" +
                        "<li><span>Sat–Sun</span><span>Closed</span></li>" +
                    "</ul>" +
                "</div>" +
                "<div>" +
                    "<h2>Record</h2>" +
                    "<p><a href=\"old.html\">Previous site</a><br>" +
                    "<a href=\"autopsy.html\">Autopsy of that site</a></p>" +
                    "<p class=\"fine\">Sunday was an unlabeled “Closed” on the old hours list. It is listed as closed here.</p>" +
                "</div>" +
            "</div>";
    }

    function field(label, name, type, required, bare) {
        const req = required ? " required" : "";
        const auto = name === "name" ? " autocomplete=\"name\"" : (name === "email" ? " autocomplete=\"email\"" : "");
        const control = '<label for="' + name + '">' + label + "</label>" +
            '<input id="' + name + '" name="' + name + '" type="' + type + '"' + req + auto + ">";
        return bare ? control : "<div>" + control + "</div>";
    }

    const mount = document.getElementById("quote-mount");
    if (!mount) return;

    mount.innerHTML =
        '<form class="quote-form" method="post" action="mailto:mayan.fogarty@maximizeyourtech.com" enctype="text/plain">' +
            '<div class="form-grid">' +
                field("Name", "name", "text", true, false) +
                field("Email", "email", "email", true, false) +
                '<div><label for="offer">Offer</label><select id="offer" name="offer" required>' +
                    '<option value="">Choose one</option>' +
                    '<option value="captions">Live room captions</option>' +
                    '<option value="stream">Live stream</option>' +
                    '<option value="video">Caption a finished video</option>' +
                    '<option value="goods">Print, engraving, or a mark</option>' +
                    '<option value="computer">Computer build or upgrade</option>' +
                    '<option value="woojer">Woojer Vest 4</option>' +
                    '<option value="other">Something else</option>' +
                "</select></div>" +
                field("Date needed", "date", "date", false, false) +
                '<div class="full">' + field("Place", "place", "text", false, true) + "</div>" +
                '<div class="full"><label for="details">What you need</label>' +
                    '<textarea id="details" name="details" required></textarea></div>' +
                '<div class="full"><button class="button" type="submit">Open the email</button></div>' +
            "</div>" +
        "</form>";

    const form = mount.querySelector("form");
    const select = form.querySelector("[name=offer]");
    const allowed = {
        captions: true,
        stream: true,
        video: true,
        goods: true,
        computer: true,
        woojer: true,
        other: true
    };
    const requested = new URLSearchParams(location.search).get("offer");
    if (requested && allowed[requested]) select.value = requested;

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        const data = new FormData(form);
        const offerLabel = select.options[select.selectedIndex].text;
        const body = [
            "Name: " + data.get("name"),
            "Email: " + data.get("email"),
            "Offer: " + offerLabel,
            "Date needed: " + (data.get("date") || "not set"),
            "Place: " + (data.get("place") || "not set"),
            "",
            String(data.get("details") || "")
        ].join("\n");
        location.href = "mailto:mayan.fogarty@maximizeyourtech.com?subject=" +
            encodeURIComponent("Quote — " + offerLabel) +
            "&body=" + encodeURIComponent(body);
    });
})();
