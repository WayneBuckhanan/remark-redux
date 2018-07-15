import SlideView from './SlideView';
import NotesView from './NotesView';
import Scaler from '../Scaler';
import { addClass, removeClass, toggleClass, hasClass, getPrefixedProperty } from '../utils';
import Printing from '../components/Printing/Printing';
import ProgressBar from "../components/ProgressBar/ProgressBar";
import Controls from "../components/Controls/Controls";
import HelpView from "./HelpView";
import Dom from "../Dom";
import SlideNumber from "../components/SlideNumber/SlideNumber";

export default class SlideShowView {
  constructor(events, containerElement, slideShow) {
    this.events = events;
    this.slideShow = slideShow;
    this.scaler = new Scaler(events, slideShow);
    this.printing = new Printing();
    this.slideViews = [];

    // Bind functions
    this.configureContainerElement = this.configureContainerElement.bind(this);
    this.setTransition = this.setTransition.bind(this);
    this.configureChildElements = this.configureChildElements.bind(this);
    this.scaleElements = this.scaleElements.bind(this);
    this.updateSlideViews = this.updateSlideViews.bind(this);
    this.scaleSlideBackgroundImages = this.scaleSlideBackgroundImages.bind(this);
    this.showSlide = this.showSlide.bind(this);
    this.hideSlide = this.hideSlide.bind(this);
    this.updateDimensions = this.updateDimensions.bind(this);
    this.registerEvents = this.registerEvents.bind(this);
    this.isEmbedded = this.isEmbedded.bind(this);
    this.handleFullScreen = this.handleFullScreen.bind(this);

    let options = this.slideShow.getOptions();

    this.progressBar = options.progressBar ? new ProgressBar(this.slideShow) : null;
    this.controls = options.controls && options.allowControl ? new Controls(
        this.slideShow,
        this.events,
        options.controlsLayout,
        options.controlsBackArrows,
        options.controlsTutorial
      ) : null;
    this.slideNumber = options.slideNumber && !options.folio ? new SlideNumber(this.slideShow, 1, true) : null;

    // Configure elements
    this.configureContainerElement(containerElement);
    this.configureChildElements();

    this.updateDimensions();
    this.scaleElements();
    this.updateSlideViews();
    this.registerEvents();

    this.handleFullScreen(this);
  }

  registerEvents() {
    this.events.on('slidesChanged', () => {
      this.updateSlideViews();
    });

    this.events.on('hideSlide', (slideIndex) => {
      this.hideSlide(slideIndex);
    });

    this.events.on('showSlide', (slideIndex) => {
      this.showSlide(slideIndex);
    });

    this.events.on('forcePresenterMode', () => {
      if (!hasClass(this.containerElement, 'remark-container--presenter-mode')) {
        toggleClass(this.containerElement, 'remark-container--presenter-mode');
        this.scaleElements();
        this.printing.setPageOrientation('landscape');
      }
    });

    this.events.on('togglePresenterMode', () => {
      toggleClass(this.containerElement, 'remark-container--presenter-mode');
      this.scaleElements();
      this.events.emit('toggledPresenter', this.slideShow.getCurrentSlideIndex() + 1);

      if (hasClass(this.containerElement, 'remark-container--presenter-mode')) {
        this.printing.setPageOrientation('portrait');
      } else {
        this.printing.setPageOrientation('landscape');
      }
    });

    this.events.on('toggleHelp', () => {
      toggleClass(this.containerElement, 'remark-container--help-mode');
    });

    const changeMode = (mode, newState) => {
      let stateClass = 'remark-container--' + mode + '-mode';

      if (typeof newState === "undefined") {
        newState = !hasClass(this.containerElement, stateClass);
      }

      if (newState === true) {
        addClass(this.containerElement, stateClass);
      } else if (newState === false) {
        removeClass(this.containerElement, stateClass);
      }

      let updateState = {};
      updateState[mode] = newState;
      this.slideShow.updateState(updateState);
    };

    this.events.on('toggleBlackout', (newState) => {
      changeMode('blackout', newState);
    });

    this.events.on('toggleMirrored', (newState) => {
      changeMode('mirrored', newState);
    });


    this.events.on('hideOverlay', () => {
      changeMode('blackout', false);
      removeClass(this.containerElement, 'remark-container--help-mode');
    });

    this.events.on('togglePause', (newState) => {
      changeMode('pause', newState);
    });
  }

  configureContainerElement(element) {
    this.containerElement = element;

    addClass(element, 'remark-container');

    let options = this.slideShow.getOptions();

    if (options.folio) {
      addClass(element, 'remark-container--folio');
    }

    if (element === Dom.getBodyElement()) {
      addClass(Dom.getHTMLElement(), 'remark-container');

      SlideShowView.forwardEvents(this.events, window, [
        'hashchange', 'resize', 'keydown', 'keypress', 'mousewheel',
        'message', 'DOMMouseScroll'
      ]);
      SlideShowView.forwardEvents(this.events, this.containerElement, [
        'touchstart', 'touchmove', 'touchend', 'click', 'contextmenu'
      ]);
    } else {
      element.style.position = 'absolute';
      element.tabIndex = -1;

      SlideShowView.forwardEvents(this.events, window, ['resize']);
      SlideShowView.forwardEvents(this.events, element, [
        'keydown', 'keypress', 'mousewheel',
        'touchstart', 'touchmove', 'touchend'
      ]);

      let currentDimension = element.offsetWidth + '|' + element.offsetHeight;

      Dom.addIntervalEvent(
        'resizeContainerElement',
        10,
        () => {
          let dimension = element.offsetWidth + '|' + element.offsetHeight;

          if (dimension !== currentDimension) {
            this.events.emit('resize');
            currentDimension = dimension;
          }
        }
      );
    }

    // Tap event is handled in slideShow view
    // rather than controller as knowledge of
    // container width is needed to determine
    // whether to move backwards or forwards
    this.events.on('tap', (endX) => {
      if (endX < this.containerElement.clientWidth / 2) {
        this.slideShow.goToPreviousSlide();
      } else {
        this.slideShow.goToNextSlide();
      }
    });
  }

  scaleElements() {
    this.slideViews.forEach((slideView) => {
      slideView.scale(this.slidesArea);
    });

    if (this.previewArea.children.length) {
      this.scaler.scaleToFit(this.previewArea.children[0].children[0], this.previewArea);
    }

    this.scaler.scaleToFit(this.helpElement, this.containerElement);
  }

  setTransition() {
    let options = this.slideShow.getOptions();

    if (options.transition) {
      this.slidesArea.setAttribute('data-remark-transition', options.transition);
    }

    if (options.transitionSpeed) {
      this.slidesArea.setAttribute('data-remark-transition-speed', options.transitionSpeed);
    }
  }

  static createPauseElement() {
    let text = Dom.createElement({
      className: 'remark-pause__text',
      innerHTML: '<span>Paused</span>'
    });

    return Dom.createElement(
      {className: 'remark-pause'},
      [text]
    );
  }

  configureChildElements() {
    // Slides Area
    this.slidesArea = Dom.createElement({className: 'remark-slides-area'});
    this.containerElement.appendChild(this.slidesArea);

    // Preview Area
    this.previewArea = Dom.createElement({className: 'remark-preview-area'});
    this.containerElement.appendChild(this.previewArea);

    // Notes Area
    this.notesView = new NotesView(this.events, () => (this.slideViews));
    this.notesArea = this.notesView.element;
    this.containerElement.appendChild(this.notesArea);

    // Backdrop
    this.backdropElement = Dom.createElement({className: 'remark-backdrop'});
    this.containerElement.appendChild(this.backdropElement);

    // Help
    this.helpView = new HelpView();
    this.helpElement = this.helpView.element;
    this.containerElement.appendChild(this.helpElement);

    // Pause
    this.pauseElement = this.constructor.createPauseElement();
    this.containerElement.appendChild(this.pauseElement);

    this.events.on('propertiesChanged', (changes) => {
      if (changes.hasOwnProperty('ratio')) {
        this.updateDimensions();
      }
    });

    this.events.on('resize', () => {
      this.scaleElements();
    });

    this.printing.on('print', (e) => {
      let slideHeight = (e.isPortrait) ? e.pageHeight * 0.4 : e.pageHeight;

      this.slideViews.forEach((slideView) => {
        slideView.scale({
          clientWidth: e.pageWidth,
          clientHeight: slideHeight
        });

        if (e.isPortrait) {
          slideView.scalingElement.style.top = '20px';
          slideView.notesElement.style.top = slideHeight + 40 + 'px';
        }
      });
    });

    if (this.progressBar !== null) {
      this.slidesArea.appendChild(this.progressBar.element);
    }

    if (this.controls !== null) {
      this.slidesArea.appendChild(this.controls.element);
    }

    if (this.slideNumber !== null) {
      this.slidesArea.appendChild(this.slideNumber.element);
    }

    this.setTransition();
  }

  updateSlideViews() {
    this.slideViews.forEach((slideView) => {
      this.slidesArea.removeChild(slideView.containerElement);
    });

    this.slideViews = this.slideShow.getSlides().map((slide) => (
      new SlideView(this.events, this.slideShow, this.scaler, slide)
    ));

    this.slideViews.forEach((slideView) => {
      this.slidesArea.appendChild(slideView.containerElement);
    });

    this.updateDimensions();

    if (this.slideShow.getCurrentSlideIndex() > -1) {
      this.showSlide(this.slideShow.getCurrentSlideIndex());
    }

    this.setTransition();
  }

  scaleSlideBackgroundImages(dimensions) {
    this.slideViews.forEach((slideView) => {
      slideView.scaleBackgroundImage(dimensions);
    });
  }

  showSlide(slideIndex) {
    this.events.emit("beforeShowSlide", slideIndex);
    this.slideViews[slideIndex].show();

    let nextSlideView = this.slideViews[slideIndex + 1];
    this.previewArea.innerHTML = (nextSlideView) ? nextSlideView.containerElement.outerHTML : '';
    this.events.emit("afterShowSlide", slideIndex);

    for (let currentSlideIndex = 0; currentSlideIndex < this.slideViews.length; currentSlideIndex++) {
      if (currentSlideIndex < slideIndex) {
        this.slideViews[currentSlideIndex].prev();
      } else if (currentSlideIndex > slideIndex) {
        this.slideViews[currentSlideIndex].next();
      }
    }
  }

  hideSlide(slideIndex) {
    this.events.emit("beforeHideSlide", slideIndex);
    this.slideViews[slideIndex].hide();
    this.events.emit("afterHideSlide", slideIndex);
  }

  updateDimensions() {
    let dimensions = this.scaler.dimensions;
    this.helpElement.style.width = dimensions.width + 'px';
    this.helpElement.style.height = dimensions.height + 'px';
    this.scaleSlideBackgroundImages(dimensions);
    this.scaleElements();
  }

  isEmbedded() {
    return this.containerElement !== Dom.getBodyElement();
  }

  handleFullScreen() {
    const requestFullScreen = getPrefixedProperty(this.containerElement, 'requestFullScreen');
    const cancelFullScreen = getPrefixedProperty(document, 'cancelFullScreen');

    this.events.on('toggleFullScreen', () => {
      let fullScreenElement = getPrefixedProperty(document, 'fullScreenElement') ||
        getPrefixedProperty(document, 'fullScreenElement');

      if (!fullScreenElement && requestFullScreen) {
        requestFullScreen.call(this.containerElement, Element.ALLOW_KEYBOARD_INPUT);
      } else if (cancelFullScreen) {
        cancelFullScreen.call(document);
      }

      this.scaleElements();
    });
  }

  static forwardEvents(target, source, events) {
    events.forEach((eventName) => {
      source.addEventListener(eventName, function () { // Don't use arrow functions
        let args = Array.prototype.slice.call(arguments);
        target.emit.apply(target, [eventName].concat(args));
      });
    });
  }
}