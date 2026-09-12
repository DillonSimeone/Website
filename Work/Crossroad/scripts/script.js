var controller = new ScrollMagic.Controller();
var reasons = document.querySelectorAll(".reason")
var scenes =
    reasons.forEach(reason => {
        reason.className = "reason faded"
        new ScrollMagic.Scene({
                triggerElement: reason,
                offset: 10,
                triggerHook: 0.7,
            })
            .setClassToggle(reason, "visible")
            .addTo(controller)
    })

window.addEventListener('scroll', function () {
    // Get the current scroll position of the page
    var scrollPosition = window.scrollY;
    var nav = document.querySelector("nav")
    var logo = document.querySelector("#logo")
    // Check if the user has scrolled down
    if (scrollPosition > 0) {
        nav.className = "navSlide"
        logo.style.display = "block"
        nav.style.top = `${nav.clientWidth/2 -30}px`
        nav.style.right = `-${nav.clientWidth/2 -30}px`
    } else {
        logo.style.display = "none"
        nav.className = ""
        nav.style.top = `0px`
        nav.style.right = `0px`
    }
});

/* var about = new tingle.modal({
    footer: false,
    stickyFooter: false,
    closeMethods: ['overlay', 'button', 'escape'],
    closeLabel: "Close",
    cssClass: ['custom-class-1', 'custom-class-2'],
    onOpen: function () {},
    onClose: function () {},
    beforeClose: function () {
        // here's goes some logic
        // e.g. save content before closing the modal
        return true; // close the modal
        return false; // nothing happens
    }
});
let content = document.querySelector(`#about`).innerHTML
about.setContent(content)


var signUp = new tingle.modal({
    footer: false,
    stickyFooter: false,
    closeMethods: ['overlay', 'button', 'escape'],
    closeLabel: "Close",
    cssClass: ['custom-class-1', 'custom-class-2'],
    onOpen: function () {},
    onClose: function () {},
    beforeClose: function () {
        // here's goes some logic
        // e.g. save content before closing the modal
        return true; // close the modal
        return false; // nothing happens
    }
})

content = document.querySelector('#signUp').innerHTML
signUp.setContent(content)

var logIn = new tingle.modal({
    footer: false,
    stickyFooter: false,
    closeMethods: ['overlay', 'button', 'escape'],
    closeLabel: "Close",
    cssClass: ['custom-class-1', 'custom-class-2'],
    onOpen: function () {},
    onClose: function () {},
    beforeClose: function () {
        // here's goes some logic
        // e.g. save content before closing the modal
        return true; // close the modal
        return false; // nothing happens
    }
})
content = document.querySelector(`#logIn`).innerHTML
logIn.setContent(content) */