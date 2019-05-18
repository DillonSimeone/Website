function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

var selectedButton = "";
var HistoryAPIControlsEnable = true; //History Api witchery

window.addEventListener('popstate', function (e) {
  reveal(e.state.previousPage, e.state.previousButton, 30, true);
});

function reveal(targetID, buttonID, timedelay, historyAPI) {
  if (buttonID !== "") button = document.getElementById(buttonID);
  if (timedelay == undefined) timedelay = 60; //Default value

  setTimeout(function () {
    hideAll(targetID, buttonID);

    if (button !== undefined) {
      selectedButton = buttonID;
    }

    target = document.getElementById(targetID);
    target.className = "item reveal";
  }, timedelay);

  if (HistoryAPIControlsEnable) {
    //Toggle for history api functionality. 
    if (historyAPI !== true) {
      //This checks if the popstate event was fired, so the user don't get trapped in an infinite loop in history!
      if (buttonID === "homeBtn" || buttonID === "") history.replaceState({
        previousPage: "".concat(targetID),
        previousButton: "".concat(buttonID)
      }, '', "/Website/"); //So ? homeBtn don't display, because that page is displayed by default. Makes the URL to look nicer, in case people shares it when viewing the first page.
      else history.pushState({
          previousPage: "".concat(targetID),
          previousButton: "".concat(buttonID)
        }, '', "/Website/?page=".concat(buttonID));
    }
  }
}

; //Hides all pages expect targetID and sets buttonID's style to show that it's selected when setting all other buttons' colors to the default.

function hideAll(targetID, buttonID) {
    let items;
    let navButtons;
    try{
        items = _toConsumableArray(document.getElementsByClassName('item'));
        navButtons = _toConsumableArray(document.getElementsByClassName("navButton"));
    }catch(error){
        console.log(error)
    }
  
  items.forEach(function (element) {
    if (element.getAttribute('id') === targetID) {//Those items are not the items you are looking for. *Waving hand*
    } else {
      element.className = "item hide spin";
    }
  });
  navButtons.forEach(function (element) {
    if (element.getAttribute('id') === buttonID) {//Do nothing.
    } else {
      element.style.fill = "#666";
    }
  });
}

; //Wonder if CSS will be able to generate random colors one day. Could replace this bit by using a keyframe with the palette of color in it... Switch between the colors, from start to end over a few minutes or something.

function randomizeColor() {
  var hireMe = document.querySelector('#hire');
  hireMe.style.backgroundColor = randomPaletteColor();

  try{
    var buttons = _toConsumableArray(document.querySelectorAll("nav div"));
  }catch(error){
      console.log(error)
  }
  

  buttons.forEach(function (element) {
    element.onmouseover = function () {
      this.style.fill = randomPaletteColor();
    };

    element.onmouseout = function () {
      //Selected buttons keeps their random hover colors.
      if (this.id !== selectedButton) {
        this.style.fill = "#666";
      }
    };
  });
} //Handy snippet that reads the url bar and gets all of the vars there.


function getUrlVars() {
  var vars = {};
  var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
    vars[key] = value;
  });
  return vars;
}

function setUp() {
  var page = getUrlVars().page;
  reveal('loading', '', 30); //Note to self, if the delay on this is higher than any of the other panels... This gets called AFTER those panels, resulting in infinite loading!

  draw();
  randomizeColor(); //console.log(`URL var: ${page}`)

  if (page !== undefined) {
    document.querySelector("#".concat(page)).click(); //console.log(document.querySelector(`#${page}`))
  } else reveal('elevatorPitch', 'homeBtn');
}

setUp();