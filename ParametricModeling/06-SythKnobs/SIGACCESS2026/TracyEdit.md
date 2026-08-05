# **ACCESS KNOB: Parametric Design of 3D-Printable Accessible Synthesizer Controls for Users with Reduced Hand Strength**

## **Abstract**

Dillon Simeone∗ [dillonsimeone@gmail.com](mailto:dillonsimeone@gmail.com) CymaSpace / Universal Music Design Portland, Oregon, USA

Add additional authors

Synthesizers and electronic musical instruments are popular tools for creating contemporary music, offering versatile expressions of music compositions that easily transfer to electronic media platforms. While these tools increase the accessibility of music production to broader populations, particularly by reducing barriers for recording and distributing music, the physical design of the instruments present significant accessibility barriers for users with motor impairments affecting grip strength and fine motor control. This barrier unnecessarily deters musicians with these impairments from creating music. To address this, the  ACCESS KNOB, an open-source parametric web tool for generating customizable 3D-printable knobs, will  make it possible to create replacement knobs for synthesizers and electronic musical instruments that can be operated with reduced hand strength and sensation. 

CUT TEXT:

The system emerged from a lived encounter with a retired IT worker and synthesizer collector whose dialysis-dependent kidney failure resulted in loss of hand strength, rendering his collection of synthesizers largely un-playable. ACCESS KNOB provides configurable parameters including groove depth, width, count, and profile; outer diameter; height; taper; mounting modes (swap-in or slide-over); and bore fit with set-screw options. A mutation engine generates random-ized variant batches exportable as STL, JSON, CSV, or OpenSCAD files. Shape and color coding (square, hexagonal, and triangular cross-sections) support users with low vision. The browser-based tool interface is operable via face and voice control through platform-level accessibility features (Apple Voice Control, Switch Control, Google Project Gameface), ensuring end-to-end accessi-bility from design to fabrication. We describe the system design, present initial field deployment results, and discuss implications for parametric assistive technology design, universal music design principles, and extensibility to other instrument types.

## **CCS Concepts**

* **Human-centered computing** → **Accessibility technolo-gies**; *Accessibility design and evaluation methods*; • **Applied com-puting** → **Sound and music computing**.

## **Keywords**

accessibility, assistive technology, parametric design, 3D print-ing, synthesizers, motor impairments, universal design, music technology

**ACM Reference Format:**

Dillon Simeone and Shawn Trail. 2025\. ACCESS KNOB: Parametric De-sign of 3D-Printable Accessible Synthesizer Controls for Users with Re-duced Hand Strength. In *Proceedings of International Conference on New Interfaces for Musical Expression (NIME ’25).* ACM, New York, NY, USA, [6](#william-c-payne,-ann-paradiso,-and-shaun-kane.-2020.-cyclops:-designing-an-eye-controlled-instrument-for-accessibility-and-flexible-use.-in-proceedings-of-nime-2020.-doi:-10.5281/zenodo.4813204) pages. [https://doi.org/nn.nnnn/nnnnnnn.nnnnnnn](https://doi.org/nn.nnnn/nnnnnnn.nnnnnnn)

∗Deaf Lead Design Engineer \- Universal Music Design

Permission to make digital or hard copies of all or part of this work for personal or classroom use is granted without fee provided that copies are not made or distributed for profit or commercial advantage and that copies bear this notice and the full citation on the first page. Copyrights for components of this work owned by others than the author(s) must be honored. Abstracting with credit is permitted. To copy otherwise, or republish, to post on servers or to redistribute to lists, requires prior specific permission and/or a fee. Request permissions from [permissions@acm.org.](mailto:permissions@acm.org)

*NIME ’25, June 24–27, 2025, Canberra, Australia*

© 2025 Copyright held by the owner/author(s). Publication rights licensed to ACM. ACM ISBN 978-x-xxxx-xxxx-x/YY/MM [https://doi.org/nn.nnnn/nnnnnnn.nnnnnnn](https://doi.org/nn.nnnn/nnnnnnn.nnnnnnn)

**Introduction**  
Musical expression through synthesizers and electronic instruments requires precise tactile control of numerous parameters, such as knobs, faders, and buttons. For musicians with motor impairments, reduced grip strength, or diminished hand sensation, these standard interface controls can present insurmountable barriers to the usability of these tools, and subsequently, limits full access to creative expression through music creation. The typical synthesizer knob—small in diameter, smooth or minimally textured, and requiring precision grip and fine motor control—excludes a significant population of potential users. \[citation for this? Or at least a list of the types of users impacted?\]

This work was interested by a retired IT professional and avid synthesizer collector who, due to  dialysis-dependent kidney failure, had progressively lost hand strength and sensation. This disability grew to the point where his wall of synthesizers—accumulated over decades—had become largely unplayable. His workarounds included using a T-wrench for leverage and dragging his palm across controls, neither of which afforded the nuanced, expressive control integral to synthesizer performance.

While some people may be born with hand disabilities or develop hand disabilities later in life, many people will experience hand function reduction due to the aging process. Over time, humans are expected to increase decreased fine motor skills and grip strength decline as they age \[cite\]. Unfortunately, synthesizers and electronic instruments are standardized to favor smaller knob designs with no mainstream alternatives. 

ACCESS KNOB leverages the increased availability of 3D printers \[cite\] to allow musicians to generate customized 3D-printable replacement knobs using a parametric web-based tool. Building on Universal Music Design (UMD) principles\[[1](#references), [2](#nate-hergert,-dillon-simeone,-doga-cavdir,-duncan-macconnell,-shawn-trail,-and-myles-de-bastion.-2024.-gestolumina:-gesture-interpreted-light,-sound-and-haptics.-towards-a-framework-for-universal-music-design.-in-proceedings-of-nime-2024.)\]—which apply universal design concepts to music accessibility for Deaf and Hard of Hearing (DHH) and other disabled communities—ACCESS KNOB addresses motor accessibility needs while maintaining applicability for all users. We contribute: (1) documentation of a parametric design system for accessible synthesizer controls informed by lived disability experience; (2) field deployment methodology and preliminary findings from initial user testing; (3) discussion of extensibility to other instrument types and assistive device domains; and (4) reflection on open-source distribution as an accessibility strategy.

## 

1. ## **Related Work**

   1. **Accessible Musical Instruments for Motor Impairments**

Research on accessible digital musical instruments (DMIs) has grown substantially, though focus on motor disabilities varies. Frid’s comprehensive review\[[3](#doga-cavdir,-dillon-simeone,-myles-de-bastion,-shawn-trail,-and-nate-hergert.-2024.-sonic-agency:-a-group-autoethnography-of-technology-mediated-practice-by-deaf-and-hard-of-hearing-musicians.-in-proceedings-of-acm-sigaccess-conference-on-computers-and-accessibility.)\] found that motor impairments were among the most commonly addressed disabilities in DMI design, yet few projects centered users’ lived experiences or employed participatory methods.

McMillan and Morreale\[[4](#emma-frid.-2019.-accessible-digital-musical-instruments—a-review-of-musical-interfaces-in-inclusive-music-practice.-multimodal-technologies-and-interaction-3,-3-\(july-2019\),-57.-doi:-10.3390/mti3030057)\] advocate for addressing the musician-instrument relationship directly, incorporating occupational ther-apy frameworks into instrument design for users with physi-cal limitations. McCloskey et al.\[[5](#andrew-mcmillan-and-fabio-morreale.-2023.-designing-accessible-musical-instruments-by-addressing-musician-instrument-relationships.-frontiers-in-computer-science-5-\(may-2023\),-1153232.-doi:-10.3389/fcomp.2023.1153232)\] explored accessible button controllers for digital musicians with cerebral palsy, emphasizing customizable tactile interfaces. Payne et al.\[[6](#william-c-payne,-ann-paradiso,-and-shaun-kane.-2020.-cyclops:-designing-an-eye-controlled-instrument-for-accessibility-and-flexible-use.-in-proceedings-of-nime-2020.-doi:-10.5281/zenodo.4813204)\] designed eye-controlled instruments for users with severe motor restrictions, demonstrating alternative control modalities.

However, most accessible DMI research focuses on novel instruments rather than adaptations to existing, commercially available instruments. Synthesizer users often have significant invest-ments in specific hardware; replacement rather than adaptation may not be economically or emotionally viable. Our approach ad-dresses this gap by enabling retrofitting of existing instruments.

2. ## 	**Parametric and Generative Design for Assistive Devices**

Parametric design—where geometric models are defined by adjustable parameters—enables mass customization of assistive devices\[[7](#william-c-payne,-ann-paradiso,-and-shaun-kane.-2020.-cyclops:-designing-an-eye-controlled-instrument-for-accessibility-and-flexible-use.-in-proceedings-of-nime-2020.-doi:-10.5281/zenodo.4813204)\]. Recent work demonstrates parametric 3D-printed as-sistive devices for cerebral palsy\[[8](#tandon-et-al.-2023.-parametric-design-platforms-for-assistive-device-customiza-tion.-[journal-name-tbd].)\], where individualized grip dimensions significantly improved functionality compared to commercial counterparts.

Generative design, which employs algorithms to explore design spaces, has been applied to prosthetics, orthotics, and adap-tive equipment. The combination of parametric design and acces-sible fabrication (3D printing) democratizes assistive technology development, enabling practitioners, users, and communities to produce customized [solutions\[9\].](#santos-et-al.-2023.-a-parametric-3d-printed-assistive-device-for-people-with-cerebral-palsy—assessment-of-outcomes-and-comparison-with-a-commercial-counterpart.-assistive-technology.-doi:-10.1080/10400435.2023.2202696)

Our mutation engine extends this paradigm by generating variant batches, enabling rapid iteration and user-driven selection from a design space rather than manual parameter adjustment.

3. ## **Bespoke Designs**

As user needs are highly specific to individual physical constraints and abilities, ACCESS KNOB allows users to customize bespoke designs to maximize usability of knobs for individual users. Design variables include 12 parametric controls to support a variety of accommodations.

4. ## **3D Printing for Accessibility**

Additive manufacturing has transformed assistive technology prototyping and production\[[10](#megan-hofmann,-devva-kasnitz,-jennifer-mankoff,-and-cynthia-l-bennett.-2020.-living-disability-theory:-reflections-on-access,-research,-and-design.-in-proceedings-of-the-22nd-international-acm-sigaccess-conference-on-computers-and-accessibility.-acm,-1–13.-doi:-10.1145/3373625.3416996)\]. Low-cost fused deposition modeling (FDM) printers enable on-demand fabrication of customized devices. Open-source repositories (e.g., Thingiverse, Printables) distribute assistive technology designs globally, though quality control and customization remain challenges.

3D printing’s advantages for assistive devices include: rapid prototyping cycles, geometric complexity without added cost, on-demand production reducing inventory, and material recyclability. For musical applications, 3D printing has been used for custom instrument components, adaptive mouthpieces for wind [instruments\[11\],](#desai-et-al.-2019.-3d-printing-for-accessibility:-a-review.) and tactile music [notation\[12\].](#quinn-d-jarvis-holland,-crystal-quartez,-francisco-botello,-and-nathan-gam-mill.-2020.-expanding-access-to-music-technology:-rapid-prototyping-ac-cessible-instrument-solutions-for-musicians-with-intellectual-disabilities.-in-proceedings-of-nime-2020.-doi:-10.5281/zenodo.4813286)

5. ## **Single User Studies**     Add studies from ASSETS,CHI (only on accessibility topics), and NIME (only on accessibility topics) literature  

## 

   6. ## **DHH and Motor Disability Overlap in Music Technology**

ACCESS KNOB integrates and promotes Universal Music Design approaches to increase accessibility of music technology that historically excluded DHH musicians and musicians with motor disabilities. UMD\[[1](#references)\] positions music accessibility as inherently multimodal and cross-disability, promoting multimodal feedback (visual, haptic, gestural), 

customizable sensory channels, and user-led design.

The overlap between DHH and motor accessibility is significant: both benefit from larger, more tactile controls; visual feedback systems; and reduced reliance on fine motor 

precision. Research on haptic music feedback for DHH users\[[13](#doga-cavdir.-2022.-touch,-listen,-\(re\)act:-co-designing-vibrotactile-wearable-instruments-for-deaf-and-hard-of-hearing.-in-proceedings-of-nime-2022.-doi:-10.21428/92fbeb44.b24043e8), [14](#doga-cavdir.-2022.-touch,-listen,-\(re\)act:-co-designing-vibrotactile-wearable-instruments-for-deaf-and-hard-of-hearing.-in-proceedings-of-nime-2022.-doi:-10.21428/92fbeb44.b24043e8)\] demonstrates that vibrotactile interfaces designed for one disability community often benefit others.

DHH individuals may also experience motor coordination challenges related to vestibular system development\[[15](#odo.4813305)\], creating compounded access needs. Designing for intersectional disability identities requires flexible, parametric systems rather than single-solution devices.

2. ## **System Description**

ACCESS KNOB is a browser-based parametric design tool built using JavaScript, Three.js for 3D visualization, and a custom geometry engine for procedural knob generation. The interface provides real-time 3D preview, parameter sliders, export options, and a mutation engine for generative design exploration.

The system provides parametric control over groove geometry (depth, width, count, profile shape), outer diameter, height, taper angle, mounting mode (swap-in replacement or slide-over sleeve), bore dimensions, and set-screw placement. A generative mutation engine produces batches of randomized variants for rapid prototyping. Shape-coding (square, hexagonal, triangular cross-sections) and color-coding support users with low vision, connecting motor and visual accessibility within a single design framework.

1. ## **Parametric Controls**

Users adjust the following parameters via sliders and numerical inputs:

**Shape**: Cross-sectional profile—circular, square, hexagonal, triangular, pentagon, octagon, star, or gear. Shape-coding aids users with low vision in distinguishing knob functions by touch and sight (Figure [1).](#figure-1:-profile-shape-options-including-triangle,-diamond,-pentagon,-hexagon,-octagon,-and-star-configurations-for-tactile-and-visual-distinction.)

**Outer Diameter**: Range 15mm–50mm. Larger diameters re-duce required grip force by increasing mechanical advantage. Default 35mm based on preliminary user testing.

**Height**: Range 10mm–40mm. Taller knobs provide greater surface area for palm-dragging techniques and accommodate varied grip strategies.

**Taper**: Angle 0%–70%. Tapering provides ergonomic grip vari-ation and visual/tactile distinction between knobs.

**Groove Depth**: Range 1mm–5mm. Deep grooves increase friction and provide tactile landmarks for users with reduced sensation.

**Groove Width**: Range 1mm–5mm. Wider grooves accommo-date users with limited finger dexterity.

**Groove Count**: Range 4–12. Higher counts provide finer tac-tile resolution; lower counts increase individual groove promi-nence.

**Groove Profile**: Square, rounded, or V-shaped. Profile affects grip friction and tactile feel.

**Bore Diameter**: Range 4mm–10mm. Matches shaft diameter of target synthesizer. Knob database provides common values for popular synthesizers.

**Slot Depth**: D-shaft slot depth for rotational locking, 0mm–3mm.

**Clearance**: Bore fit tolerance, 0mm–0.5mm, adjustable for printer precision and friction-fit preference.

**Set Screw**: Toggle and position (top/side). Enables secure me-chanical fastening without requiring friction fit.

2. ## **Mounting Modes**

ACCESS KNOB supports two mounting strategies:

**Swap-In Mode**: Replaces original knob entirely. Requires knob removal, which may be difficult for users with limited hand strength. Provides full customization of knob geometry and is lighter weight. Suitable when original knobs are easily removable or undesired.

**Slide-Over Mode**: Sleeve fits over existing knob, preserving original while augmenting size and grip. No disassembly required. Adds bulk but enables non-destructive adaptation. Critical for users unable to remove tight-fitting original knobs or when pre-serving instrument aesthetics is desired.

![][image1]

**Figure 1: Profile shape options including triangle, diamond, pentagon, hexagon, octagon, and star configurations for tactile and visual distinction.**

3. ## **Mutation Engine**

The mutation engine generates parametric variants by applying controlled randomization to base parameters. Users specify:

* Batch size (4, 8, 12, or 16 variants)

* Mutation range (percentage deviation from base parame-ters)

* Locked parameters (exclude specific parameters from mu-tation)

Generated variants are displayed in a grid (Figure [2).](#figure-2:-access-knob-interface-showing-a-batch-of-12-generated-knob-variants-with-hexagonal-profiles.-parame-ters-are-displayed-for-the-selected-knob-\(k793-001\)-includ-ing-shape,-diameter,-height,-groove-geometry,-and-bore-specifications.-the-mutation-engine-enables-rapid-design-exploration.) Users can preview, select, and export any variant or the entire batch. This generative approach enables rapid exploration of design space, particularly valuable when user preferences are uncer-tain or when designing for multiple synthesizers with different ergonomic requirements.

**Figure 2: ACCESS KNOB interface showing a batch of 12 generated knob variants with hexagonal profiles. Parame-ters are displayed for the selected knob (K793-001) includ-ing shape, diameter, height, groove geometry, and bore specifications. The mutation engine enables rapid design exploration.**

4. ## **Export Formats**

ACCESS KNOB exports designs in multiple formats to support diverse fabrication workflows:

**STL (Stereolithography)**: Industry-standard 3D printing for-mat. Generated meshes are manifold and slicing-software com-patible.

**OpenSCAD**: Parametric script format enabling further cus-tomization by advanced users. Exported .scad files preserve pa-rameter values as variables, supporting programmatic design modifications.

**JSON**: Structured parameter data for integration with external tools, databases, or documentation systems.

**CSV**: Spreadsheet-compatible format for batch documentation, particularly useful when generating large variant sets for user selection sessions.

5. ## **Accessibility of the Tool Interface**

A critical consideration in assistive technology design is whether the design tool itself is accessible to its target user population. A parametric knob customization system that requires fine motor control to operate would perpetuate the very barriers it aims to address. ACCESS KNOB’s browser-based architecture inherently supports platform-level accessibility features without requiring custom implementation.

**Apple Voice Control and Switch Control**: macOS and iOS users can operate ACCESS KNOB entirely through voice

commands\[[17](#jutta-treviranus.-2014.-the-value-of-the-curb-cut-effect.)\] or camera-based facial gestures and head movements\[[18](#apple-inc.-2024.-use-voice-control-on-your-iphone,-ipad,-or-ipod-touch.-apple-support.-retrieved-may-20,-2025-from-https://support.apple.com/en-us/111778)\]. Voice Control enables users to speak commands to navigate, tap buttons, adjust sliders, and trigger exports. Switch Control with camera tracking allows users to control the interface through

head movements (left/right gestures) or facial expressions (e.g., smile, raised eyebrows) mapped to interface actions.

**Google Project Gameface**: Windows and Android users can employ Google’s open-source Project Gameface system\[[19](#apple-inc.-2024.-use-switch-control-to-navigate-your-iphone,-ipad,-or-ipod-touch.-apple-support.-retrieved-may-20,-2025-from-https://support.apple.com/-en-us/119835), [20](#google-llc.-2024.-project-gameface.-github-repository.-retrieved-may-20,-2025-from-https://github.com/google/project-gameface)\], which uses commodity webcam input to translate head move-ments and facial gestures into cursor control and click actions. This system operates across any web-based interface, including ACCESS KNOB’s parametric controls and mutation engine.

**Hardware Requirements**: Both Apple and Google solutions require only a standard USB webcam (approximately $15–20 USD for entry-level models meeting minimum resolution require-ments), making assistive input accessible at commodity price points. Higher-end implementations (e.g., Apple TrueDepth cam-eras on recent devices) provide enhanced facial tracking precision but are not required for functional operation.

This accessibility pathway was proactively identified by the lead author during co-design sessions and communicated to the initial user prior to the June 1 deployment visit. This ensures that users with motor impairments retain direct agency over their own knob design process, rather than relying on proxies to operate the tool on their behalf. The ability to independently explore parametric space, generate variants, and select preferred designs aligns with the sonic agency framework articulated by Cavdir et al.\[[2](#nate-hergert,-dillon-simeone,-doga-cavdir,-duncan-macconnell,-shawn-trail,-and-myles-de-bastion.-2024.-gestolumina:-gesture-interpreted-light,-sound-and-haptics.-towards-a-framework-for-universal-music-design.-in-proceedings-of-nime-2024.)\]—specifically, the right to shape one’s own tools rather than receive tools shaped by others.

3. ## **Deployment and Field Study**

   1. **Initial User and Context**

Our initial deployment targets the individual whose needs catalyzed this project: a retired IT professional (age 64\) with dialysis-dependent kidney failure resulting in progressive hand strength and sensation loss over the past eight years. This progressive disability reduced this musician’s ability to interact with his expansive instrument collection. Our goal was to create a tool that would allow this lifelong musician to continue his music practice, regardless of physical challenges. He owns approximately 20 hardware synthesizers spanning modular, semi-modular, and keyboard formats. Prior musical experience includes electronic music production and live performance.  
Current workarounds include:

* Applying a T-wrench for leverage on small knobs (limited to knobs with compatible geometries)

* Dragging a palm across control surfaces (imprecise, fatiguing)

* Avoiding instruments with densely packed or recessed controls

* Relying on software-based synthesis (reducing tactile instrument interaction)

Ultimately, these modifications have reportedly led tofrustration due to loss of expressive control and, as a result decreased motivation to engage with hardware instruments despite continued interest in synthesis.

2. ## **Methodology**

Our field study employs a participatory, iterative approach:

**Phase 1: Co-Design Sessions (Completed March 2025\)** Three visits in person. We collaboratively identified high-priority instruments and specific knobs presenting the greatest difficulty. User provided feedback on initial parameter ranges, shape pref-erences, and mounting mode requirements.  
**Phase 2: Initial Prototype Batch (April 2025\)** Based on co-design sessions, we generated a batch of 20 knob variants span-ning parameter ranges. Knobs printed in PLA filament on Bambu A1 printers. Variants included multiple diameters (25mm, 30mm, 35mm, 40mm), groove depths (2mm, 3mm, 4mm), and profiles (square, hexagonal). Batch shipped to user with docu-mentation sheet mapping knob IDs to parameters.

**Phase 3: User Testing and Feedback (May 2025, Ongoing)** User evaluates knobs on target synthesizers, assessing: ease of installation, grip comfort, rotational precision, fatigue during extended use, and aesthetic integration. Structured feedback form captures Likert-scale ratings and open-ended comments. Follow-up video call scheduled for detailed discussion.

**Phase 4: Iteration and Expanded Testing (June–July 2025\)** Refined designs based on Phase 3 feedback. Expanded testing to include additional users recruited through disability and synthesizer communities. Planned n=8–12 participants with varied motor impairments (arthritis, stroke, repetitive strain injury, mus-cular dystrophy).

3. ## **Preliminary Observations**

Initial co-design sessions yielded several insights:

**Mounting Mode Preference**: User strongly preferred slide-over mode despite added bulk, citing inability to remove tight-fitting original knobs without assistance. This underscores im-portance of non-destructive adaptation strategies.

**Diameter vs. Height Tradeoffs**: User favored larger diame-ters (35–40mm) over increased height, prioritizing reduced grip force over surface area. However, he noted densely packed con-trol panels constrain maximum diameter—highlighting need for per-instrument customization.

**Groove Preferences**: Deep, widely spaced grooves (4mm depth, 3mm width, 6 count) provided best tactile feedback. User noted reduced sensation limits benefit of finer groove counts; "fewer, deeper groves" preferred.

**Shape Coding**: User found hexagonal profile provided best grip without requiring precise hand positioning. Square profiles occasionally caused discomfort at corners; circular profiles felt too similar to original knobs.

**Color Coding**: User (who also experiences mild vision loss) found high-contrast color combinations (e.g., black knobs on sil-ver panels, white knobs on black panels) most effective. Shape alone provided insufficient distinction without color reinforcement.

4. ## **Discussion**

   1. **Design Implications**

      1. *Parametric Flexibility and User Agency.* ACCESS KNOB’s parametric approach reflects a design philosophy prioritizing user agency over designer prescription. Rather than defining "optimal" knob dimensions, we provide a tool for users to explore design space directly. While clinicians, family members, and tech-nicians may assist some users in operating the tool or fabricating designs, the primary accessibility pathway is direct operation via face and voice control (Section 3.5). This aligns with princi-ples of user-driven assistive technology\[[9](#santos-et-al.-2023.-a-parametric-3d-printed-assistive-device-for-people-with-cerebral-palsy—assessment-of-outcomes-and-comparison-with-a-commercial-counterpart.-assistive-technology.-doi:-10.1080/10400435.2023.2202696)\] and acknowledges the heterogeneity of motor impairments.

User agency extends beyond selecting from designer-generated options to encompass the act of design itself. The sonic agency framework articulated by Cavdir et al.\[[2](#nate-hergert,-dillon-simeone,-doga-cavdir,-duncan-macconnell,-shawn-trail,-and-myles-de-bastion.-2024.-gestolumina:-gesture-interpreted-light,-sound-and-haptics.-towards-a-framework-for-universal-music-design.-in-proceedings-of-nime-2024.)\] emphasizes the right to shape one’s own tools rather than receive tools shaped by others. In the context of assistive technology, this distinction is critical: a user who can independently adjust knob diameter, groove depth, and cross-sectional profile exercises creative and practical control over their instrument interface. Face and voice control operability means the target population is not dependent on proxies to mediate their design intentions. This independence preserves dignity, supports iterative refinement based on lived experience, and enables users to develop tacit knowledge about the relationship between parametric values and tactile outcomes. The mutation engine further decentralizes design authority. Users unfamiliar with parametric design can generate variants through controlled randomization, then select based on tactile evaluation rather than abstract parameter values. This approach may benefit users with cognitive disabilities or limited technical  
expertise.

2. *Intersectional Accessibility.* Designing for multiple disability communities simultaneously—motor impairments, low vision, and Deaf/HH users in the broader UMD context—requires flex-ible, multimodal systems. Shape and color coding demonstrate how a single design feature (cross-sectional profile) can address visual and tactile accessibility simultaneously. This "curb-cut effect"\[[16](#m.-e.-wink.-2018.-current-balance-levels-in-deaf-and-hearing-impaired-children.-master’s-thesis.-university-of-tennessee,-knoxville.)\] suggests features designed for disabled users bene-fit broader populations (e.g., tactile distinction aids all users in low-light performance contexts).

However, intersectional design also reveals tensions. For exam-ple, large-diameter knobs benefit motor accessibility but may in-crease visual clutter for low-vision users relying on high-contrast panels. Participatory design with multiply-disabled users is criti-cal to navigating these tradeoffs.

3. *Slide-Over as Non-Destructive Adaptation.* Slide-over mode emerged as a critical feature, despite initial assumptions that full knob replacement would be preferred. Non-destructive adaptation strategies honor users’ relationships with instruments, reduce installation barriers, and preserve resale value. This find-ing suggests other assistive adaptations (e.g., keyboard key caps, fader extensions) might benefit from similar non-permanent mounting approaches.

   2. ## **Open-Source Rationale**

ACCESS KNOB is released under a Creative Commons Attribution-ShareAlike 4.0 license. Source code, design files, and documenta-tion are available via GitHub1.

Open-source distribution addresses several accessibility barri-ers:

**Economic Access**: Commercial assistive devices are often prohibitively expensive. Open-source designs enable users with 3D printer access (personal, library, makerspace) to fabricate knobs at material cost ($0.10–$0.50 per knob in PLA).

**Customization**: Users or third-party developers can fork and modify designs for specific synthesizers, disabilities, or use cases. This distributed innovation model may produce adaptations we cannot anticipate.

**Repairability and Longevity**: Users can re-print knobs as needed, without dependence on manufacturer support or supply chains.

However, open-source distribution also presents challenges: quality control (poorly calibrated printers produce unusable parts), user support burden, and potential exploitation by commercial entities. We are developing community documentation, calibration guides, and pre-tested parameter presets to mitigate these issues.

3. ## **Extensibility to Other Instrument Types**

While ACCESS KNOB targets synthesizers, the underlying sys-tem is instrument-agnostic. Potential extensions include:

**Fader Caps**: Customizable caps for linear faders (mixing con-soles, MIDI controllers) with varied lengths, widths, and textures.

**Button Extensions**: Larger, tactile button surfaces for drum machines, samplers, and sequencers.

**Guitar/Bass Knobs**: Adapted volume and tone knobs for electric stringed instruments.

**Effects Pedal Knobs**: Stomp box customization for users with limited foot dexterity or hand-operated pedal control.

Each instrument type presents unique mechanical constraints (shaft types, clearances, panel layouts) requiring parameter range adjustments and new mounting strategies. We are exploring a modular design system where core parametric logic is shared across instrument-specific modules.

Beyond music, the system could extend to other rotary con-trols: appliances, automotive interfaces, industrial equipment, and medical devices. The parametric and generative design frame-work is domain-independent.

4. ## **Limitations and Future Work**

**Material Properties**: PLA, while accessible and easy to print, has limited durability and temperature tolerance. Future work will explore alternate materials (PETG, nylon, TPU) with improved mechanical properties and surface textures.

**Mechanical Testing**: We have not yet conducted formal mechanical testing (grip force requirements, rotational torque, wear cycles). Collaboration with occupational therapists and mechanical engineers would strengthen design validation.

**Installation Support**: Slide-over mode requires no tools, but swap-in mode assumes users can remove original knobs. For users with severe motor impairments, even this step may be prohibitive. We are developing installation jigs and exploring partnerships with repair technicians for installation services.

1 [https://github.com/\[](https://github.com/)ANONYMIZED-FOR-REVIEW\]

**Aesthetics**: Current designs prioritize function over form. Some users may find 3D-printed knobs visually incongruent with vintage or high-end synthesizers. Future work will explore surface finishing (sanding, painting, electroplating) and higher-resolution printing (resin SLA) for improved aesthetics.

**Long-Term User Studies**: Our current deployment is limited to a single user over a short time frame. Longitudinal studies with diverse motor impairments are necessary to validate design decisions and understand evolving user needs.

5. ## **Conclusion and Future Work**

ACCESS KNOB dismantles key barriers to music production and expression for DHH and disabled users with limited hand mobility that have ended music practices for musicians who could no longer use their instruments. ACCESS KNOB demonstrates how parametric design, generative algorithms, and accessible fabrication can converge to address real-world disability barriers in musical instrument interaction. By centering lived experience of how synthetic and electronic instruments are used by human beings and by prioritizing user agency through flexible, customizable designs, we offer an alternative to prescriptive, one-size-fits-all assistive devices.

Our initial field deployment, ongoing through summer 2026, will provide critical validation of design decisions and inform future iterations. We are particularly interested in understanding how users’ parameter preferences evolve over time and whether generative variant exploration leads to unexpected design innovations.

Broader impacts include: (1) establishing parametric control adaptation as a viable accessibility strategy for electronic instruments; (2) demonstrating open-source distribution as a model for assistive music technology; (3) contributing to Universal Music Design frameworks by addressing motor accessibility alongside sensory disabilities; and (4) providing a replicable design methodology applicable to other domains.

Future work will expand testing to larger, more diverse user populations; explore alternate materials and fabrication methods; develop instrument-specific design libraries; and investigate commercial partnerships for users without 3D printing access. We invite collaboration from disabled musicians, occupational therapists, instrument designers, and accessibility researchers.

6. ## **Acknowledgments**

We thank our initial user for sharing his experiences and collaborating in co-design sessions. We acknowledge the Universal Music Design team at CymaSpace for contextualizing this work within broader accessibility frameworks. We thank \[TODO: add names\] for feedback on early prototypes and assistance with 3D printing.

This work was supported by \[TODO: add funding sources if any\].

## **References** {#references}

1. Nate Hergert, Dillon Simeone, Doga Cavdir, Duncan MacConnell, Shawn Trail, and Myles de Bastion. 2024\. GestoLumina: Gesture interpreted Light, Sound and Haptics. Towards a Framework for Universal Music Design. In *Proceedings of NIME 2024*.

2. Doga Cavdir, Dillon Simeone, Myles de Bastion, Shawn Trail, and Nate Hergert. 2024\. Sonic Agency: A Group Autoethnography of Technology-mediated Practice by Deaf and Hard of Hearing Musicians. In *Proceedings of ACM SIGACCESS Conference on Computers and Accessibility*.

3. Emma Frid. 2019\. Accessible Digital Musical Instruments—A Review of Musical Interfaces in Inclusive Music Practice. *Multimodal Technologies and Interaction* 3, 3 (July 2019), 57\. DOI: 10.3390/mti3030057

4. Andrew McMillan and Fabio Morreale. 2023\. Designing accessible musical instruments by addressing musician-instrument relationships. *Frontiers in Computer Science* 5 (May 2023), 1153232\. DOI: 10.3389/fcomp.2023.1153232

5. Brendan McCloskey, Brian Bridges, and Frank Lyons. 2015\. Accessibility And Dimensionalty: Enhanced Real-Time Creative Independence For Digital Mu-sicians With Quadriplegic Cerebral Palsy. In *Proceedings of NIME 2015*. DOI: 10.5281/ZENODO.1179132

6. William C Payne, Ann Paradiso, and Shaun Kane. 2020\. Cyclops: Designing an eye-controlled instrument for accessibility and flexible use. In *Proceedings of NIME 2020*. DOI: 10.5281/ZENODO.4813204

7. Tandon et al. 2023\. Parametric design platforms for assistive device customiza-tion. *\[Journal Name TBD\]*.

8. Santos et al. 2023\. A parametric 3D printed assistive device for people with cerebral palsy—assessment of outcomes and comparison with a commercial counterpart. *Assistive Technology*. DOI: 10.1080/10400435.2023.2202696  
9. Megan Hofmann, Devva Kasnitz, Jennifer Mankoff, and Cynthia L Bennett. 2020\. Living Disability Theory: Reflections on Access, Research, and Design. In *Proceedings of the 22nd International ACM SIGACCESS Conference on Computers and Accessibility*. ACM, 1–13. DOI: 10.1145/3373625.3416996  
10. Desai et al. 2019\. 3D Printing for Accessibility: A Review.

11. Quinn D Jarvis Holland, Crystal Quartez, Francisco Botello, and Nathan Gam-mill. 2020\. Expanding Access to Music Technology: Rapid Prototyping Ac-cessible Instrument Solutions For Musicians With Intellectual Disabilities. In *Proceedings of NIME 2020*. DOI: 10.5281/ZENODO.4813286

12. Francesco Manenti and Francesco Ardan Dal Rì. 2024\. Accessibility of Graphic Scores: Design and Exploration of Tactile Supports for Blind People. In *Pro-ceedings of NIME 2024*. DOI: 10.5281/ZENODO.13904941

13. 	Doga Cavdir. 2022\. Touch, Listen, (Re)Act: Co-designing Vibrotactile Wearable Instruments for Deaf and Hard of Hearing. In *Proceedings of NIME 2022*. DOI: 10.21428/92fbeb44.b24043e8

14. Doga Cavdir and Ge Wang. 2020\. Felt Sound: A Shared Musical Experience for the Deaf and Hard of Hearing. In *Proceedings of NIME 2020*. DOI: 10.5281/ZEN-

ODO.4813305

15. M. E. Wink. 2018\. Current balance levels in deaf and hearing impaired children. Master’s thesis. University of Tennessee, Knoxville.  
16. Jutta Treviranus. 2014\. The value of the curb cut effect.

17. Apple Inc. 2024\. Use Voice Control on your iPhone, iPad, or iPod touch. Apple Support. Retrieved May 20, 2025 from [https://support.apple.com/en-us/111778](https://support.apple.com/en-us/111778)

18. Apple Inc. 2024\. Use Switch Control to navigate your iPhone, iPad, or iPod touch. Apple Support. Retrieved May 20, 2025 from [https://support.apple.com/](https://support.apple.com/en-us/119835) [en-us/119835](https://support.apple.com/en-us/119835)

19. Google LLC. 2024\. Project Gameface. GitHub repository. Retrieved May 20, 2025 from [https://github.com/google/project-gameface](https://github.com/google/project-gameface)

20. Google LLC. 2023\. Google Project Gameface: A new hands-free AI-powered gaming mouse. The Keyword (Google Blog). Retrieved May 20, 2025 from [https://blog.google/innovation-and-ai/products/google-project-gameface/](https://blog.google/innovation-and-ai/products/google-project-gameface/)

[image1]: <data:image/png;base64,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>