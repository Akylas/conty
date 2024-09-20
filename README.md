
<img title="" src="fastlane/metadata/android/en-US/images/featureGraphic.png">

<div align="center">

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](COC.md)
[![GitHub repo stars](https://img.shields.io/github/stars/Akylas/conty?style=flat)](https://github.com/Akylas/conty/stargazers)
[![GitHub License](https://img.shields.io/github/license/Akylas/conty)](https://github.com/Akylas/conty/blob/master/COPYING)
[![GitHub All Releases](https://img.shields.io/github/downloads/Akylas/conty/total.svg)](https://github.com/Akylas/conty/releases/)
[![GitHub release](https://img.shields.io/github/v/release/Akylas/conty?display_name=release)](https://github.com/Akylas/conty/releases/latest)
[![Small translation badge](https://hosted.weblate.org/widgets/conty/-/svg-badge.svg)](https://hosted.weblate.org/engage/conty/?utm_source=widget)

</div>

<!-- <h1 align="center">Scan all your documents</h1>
<p align="center">
  <a href="https://github.com/Akylas/conty" alt="License"><img src="https://img.shields.io/badge/License-MIT-blue.svg"/></a>
 <a href="https://github.com/Akylas/conty/releases" alt="Release version"><img src="https://img.shields.io/github/downloads/akylas/conty/total"/></a> -->

 ## Installation

<div align="center">

|  ||
|:-:|:-:|
|[<img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on PlayStore" height="80">](https://play.google.com/store/apps/details?id=com.akylas.conty)|[<img src="badge_github.png" alt="Get it on GitHub" height="80">](https://github.com/Akylas/conty/releases)|<div><a href="https://apps.apple.com/fr/app/conty/id1499117252"><img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&amp;releaseDate=1496188800" alt="Download on the App Store" height="58"></a></div>|
</div> 
 

<h2 align="center">Enjoying Conty?</h2>
<p align="center">Please consider making a small donation to help fund the project. Developing an application, especially one that is open source and completely free, takes a lot of time and effort.
<br>
<br>
<div align="center">
<a href="https://github.com/sponsors/farfromrefug">:heart: Sponsor</a>
</div>
<hr>

Welcome to Conty, the ultimate app for kids to enjoy immersive, interactive stories! With our app, you can download and listen to captivating, free-to-play stories that encourage creativity, imagination, and learning. Whether at home or on the go, your child can dive into exciting adventures that play right from your phone, with or without internet access!
Key Features:

🌟 Interactive Stories for All Ages:
Explore a growing library of stories designed to entertain and engage young minds. Each story is interactive, allowing children to make choices that shape the narrative, making every adventure unique!

📥 Download & Play Offline:
Download your favorite stories from the app and store them on your phone. No internet? No problem! Once downloaded, your kids can listen and enjoy the stories offline, anytime, anywhere.

🌍 Community-Created Stories:
Access free stories created by a vibrant community of storytellers and enthusiasts. Discover new voices and perspectives as the library continues to grow.

💡 Safe & Kid-Friendly Environment:
We prioritize child safety. The app offers a secure, ad-free experience with age-appropriate content, designed specifically for young children.

How It Works:

    Browse: Open the app and explore the library of available stories.
    Download: Choose a story to download and save it to your device.
    Listen & Interact: Hit play and let your child start their interactive story adventure!
    Offline Access: Once downloaded, you can access and play the stories anytime, even without an internet connection.


## Screenshots

<p align="left">
    <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/Screenshot_1726604226.png" width=30%/>
    <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/Screenshot_1726604340.png" width=30%/>
</p>

<p align="left">
    <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/Screenshot_1726604383.png" width=30%/>
    <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/Screenshot_1726604428.png" width=30%/>
</p>

### Having issues, suggestions and feedback?

You can,
- [Create an issue here](https://github.com/Akylas/conty/issues)

### Languages: [<img align="right" src="https://hosted.weblate.org/widgets/conty/-/287x66-white.png" alt="Übersetzungsstatus" />](https://hosted.weblate.org/engage/conty/?utm_source=widget)

[<img src="https://hosted.weblate.org/widgets/conty/-/multi-auto.svg" alt="Übersetzungsstatus" />](https://hosted.weblate.org/engage/conty/)

The Translations are hosted by [Weblate.org](https://hosted.weblate.org/engage/conty/).


<p align="center">
  <a href="https://raw.githubusercontent.com/farfromrefug/sponsorkit/main/sponsors.svg">
	<img src='https://raw.githubusercontent.com/farfromrefug/sponsorkit/main/sponsors.svg'/>
  </a>
</p>


Feature Graphic generated with [hotpot.ai](https://hotpot.ai/design/google-play-feature-graphic)

## Building Setup

### Nativescript

First [setup Nativescript](https://docs.nativescript.org/setup/linux)

This project is optimized to be built with [Akylas Fork](https://github.com/Akylas/NativeScript). Though it would work with main it is best to use this fork. The `package.json` defines a resolution to `../NativeScript/dist/packages/core` so clone the fork and build it using `npm run setup:yarn && npm run ui-mobile-base:build && npm run core:build`

### Yarn

You need to use yarn with this project as it uses the `portal:` protocol for some dependencies.
Note that the project has some `yarn link` for easy local dev for me. The best is for you to remove the `resolutions` part of the `package.json`

### Building

Now that all is setup and that you prepared the 3rd party libraries you can actually build and run the app:

* `yarn`
* `ns run android --no-hmr --env.devlog` (replace by `ios` for iOS...)

This should run the app on the first discovered device or emulator.