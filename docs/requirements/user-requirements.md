***Civic Radar — User Requirements***

***Document (URD)***

# ***1\. Introduction***

## ***1.1 Purpose***

*This document describes Civic Radar from the point of view of the people who use it: what they need to accomplish, and why. It intentionally leaves out data storage design, table structures, API routes, and other implementation details, focusing only on user-facing needs and goals.*

## ***1.2 Scope***

*Civic Radar is a browser-based civic information platform that helps residents of supported towns understand and act on what their local government is doing. The platform collects public meeting agendas, minutes, and, where published, voting records, uses AI to summarize and classify them, matches relevant meetings to each user's followed towns and topics, and helps users follow meetings and reach out to officials. For the semester, the platform supports a defined catalog of towns and a limited number of government bodies, starting with Salem.*

## ***1.3 Intended Audience***

*This document is for anyone who needs to understand what the product must do for its users without wading through schema design: teammates building each feature area, the course instructor evaluating the project, and anyone validating that a build actually serves the people it's for.*

## ***1.4 User Classes***

| *User class* | *Description* |
| :---- | :---- |
| *Resident* | *An individual living in a supported town who wants to follow and act on local government activity.* |
| *Organization user* | *A journalist or community organization representative who follows government activity at a broader or more research-oriented level than an individual resident.* |
| *Organization administrator* | *An organization user who manages their organization's members and assigns their permission levels.* |
| *System administrator* | *A Civic Radar team member who manages the catalog of towns, topics, and governing bodies, tracks summarization progress, and can suspend or restore accounts.* |
| *First-time user* | *Any user, on their very first login, before they've learned the app's layout.* |

   
*In a requirement, "user" means any signed-in resident or organization user.* 

## ***1.5 Operating Environment***

*A standard web browser, no installed client.*

*Pilot scale target: up to 100 registered residents, 1,000 stored documents, and 1,000 stored meetings across the supported towns.*

# ***2\. General User Needs***

*(Team Member 1 — Platform & Jurisdictions)*

*Covers topic selection, data freshness, organization permissions, catalog management, account activity history, and account suspension.*

***UR-101, KJ — Topic selection.** As a resident, I want to select the local issues that matter to me, such as housing, transportation, or school budgets, so that the platform surfaces the small number of government items that affect my life instead of everything my town discusses.*

***UR-102, KJ — Data freshness.** As a resident, I want to see when the platform last retrieved information from the government source, so that I know whether an empty or unchanged view means nothing happened or means the data is stale.*

***UR-103, KJ — Organization permissions.** As an organization administrator, I want to assign different permission levels to people in my organization, so that all of my staff can use the platform's tools while only a trusted few can add or remove members and change shared settings.*

***UR-104, KJ — Platform catalog management.** As a system administrator, I want to manage the list of topics, towns, and governing bodies available in the platform, so that the options users select from stay accurate as local government changes, without requiring a code change or redeployment.*

***UR-105, KJ — Account activity history.** As a resident, I want to review a record of recent activity on my account, including sign-ins, setting changes, and permission changes, so that I can recognize unauthorized access to an account that holds my location and political interests.*

***UR-106, KJ — Account suspension.** As a system administrator, I want to suspend and later restore a user or organization account, so that I can respond to abuse or a compromised account without permanently destroying that user's data.*

***UR-107, KJ — First-time setup.** As a first-time user, I want to be guided to choose my towns and topics when I first sign in, so that my dashboard shows relevant meetings from the start instead of an empty page.*

***UR-108, KJ — Shared organization follows.** As an organization user, I want my organization to share one set of followed towns and topics, so that everyone on our team tracks the same local issues without each member setting them up separately.*

# ***3\. Document Retrieval, Storage & AI Summarization***

*(Team Member 2 — Document Retrieval, Storage & AI Summarization)*

*Covers retrieving meetings and documents; storing, listing, viewing, downloading, and summarizing documents; and reporting source check status.*

***UR-201, MS** — **Document List View**. As a user, I want to view a list of documents retrieved from CivicClerk for the towns I follow, so that I can see recent government activity without checking each town's CivicClerk page myself.*

***UR-202, MS — Document Identification.** As a user, I want each document in my list identified clearly (e.g., by name or meeting date), so that I can tell them apart at a glance.*

***UR-203, MS — Open Document PDF.** As a user, I want to open a specific document to view its PDF, so that I can read the original source material.*

***UR-204, MS — View Document Summary.** As a user, I want to view a document's AI-generated summary, so that I don't have to read the full PDF to understand it.*

***UR-205, MS — Summary Placement.** As a user, I want a document's summary displayed directly below its PDF, so that I can reference both without navigating elsewhere.*

***UR-206, MS — Pending Summary Indicator.** As a user, I want a document that doesn't have a summary yet to be clearly marked as pending, so that I know it's not missing by **mistake.***

***UR-207, MS — Summary Source Link.** As a user, I want each summary linked back to its exact source PDF, so that I can verify it against the original if I want to.*

***UR-208, MS — Automatic Document Updates.** As a user, I want new documents to appear in my list automatically as they're published, so that I don't have to check CivicClerk myself.*

***UR-209, MS — Document Sort Order.** As a user, I want my documents sorted with the most recent first, so that I can see the latest activity without scrolling.*

***UR-210, MS — Failed Summary Notification.** As a user, I want to know if a document's summary failed to generate, so that I understand why it's not showing up.*

***UR-211, MS — PDF Access Without Summary.** As a user, I want the option to view the raw PDF even if a summary isn't available yet, so that I can still access the source information.*

***UR-212, MS — Document Town Tag.** As a user, I want to see which town a document belongs to, so that I can tell it apart from documents of other towns.*

***UR-213, MS — Multi-Town Document List.** As a user, I want to view documents from multiple towns in one combined list, so that I don't have to check each town separately.*

***UR-214, MS — Download Original PDF.** As a user, I want to download the original PDF of a document, so that I can keep a copy for my own records.*

***UR-215, MS — Retrieval Timestamp.** As a user, I want to see how long ago a document was retrieved, so that I know how recent it is.*

***UR-216, MS — Search by Title.** As a user, I want to search my document list by title, so that I can find a specific document quickly.*

***UR-217, MS — Summarization Progress.** As a system administrator, I want to see how many documents have been summarized versus how many are still pending, so that I can track processing progress.*

***UR-218, MS — PDF Load Failure Message.** As a user, I want to be shown a clear message if a document's PDF fails to load, so that I know the issue is with the file, not my connection.*

***UR-219, MS — Total Document Count.** As a user, I want to see the total number of documents in my current view, so that I have a sense of how much government activity is happening in the towns I'm tracking.*

***UR-220, MS — Retrieve meetings.** As a user, I want Civic Radar to collect each meeting's time, place, attendance details, and published files, so that meeting pages and alerts show accurate information.*

***UR-221, MS — Keep meeting data current.** As a user, I want previously retrieved meetings refreshed, so that time changes, cancellations, new minutes, and new recordings are caught.*

***UR-222, MS — Report source check status.** As a user, I want to know whether the latest check of each town worked, so that I don't mistake a failed check for no news.*

# ***4\. Officials & Contact Extractions***

*(Team Member 3 — Officials & Contact Extractions)*

*Covers extracting officials and their contact information from government documents and managing saved extraction results.*

***UR-301, AO — Request contact extraction.** As a user, I want to request officials and contact information from a specific government document, so that I do not have to search through the entire document myself.*

***UR-302, AO — View extracted details.** As a user, I want to see each extracted official’s name, title, role, and available contact information, so that I can understand who they are and how to reach them.*

***UR-303, AO — Identify the source document.** As a user, I want each extraction result linked to the document it came from, so that I can verify the information against the original source.*

***UR-304, AO — View saved extraction.** As a user, I want to access my previously saved extraction results, so that I can return to the information without processing the document again.*

***UR-305, AO — Delete saved extraction.** As a user, I want to delete my saved extraction records, so that I can remove information I no longer need.*

***UR-306, AO — Extraction progress.** As a user, I want to know when contact extraction is processing, so that I understand why the results are not immediately available.*

***UR-307, AO — Extraction failure message.** As a user, I want to receive a clear message if contact information cannot be extracted, so that I know whether to try again or review the document manually.*

***UR-308, AO — Missing information indicator.** As a user, I want unavailable details to be clearly labeled, so that I do not mistake missing information for complete contact information.*

***UR-309, AO — Search extracted contacts.** As a user, I want to search my extracted records by an official’s name, title, or role, so that I can quickly find the person I need.*

***UR-310, AO — Protect personal extraction records.** As a user, I want only my account to access and delete my saved extraction records, so that my saved information remains private.*

***UR-311, AO — Shared officials list.** As a user, I want each official found in government documents to appear once in a shared officials list with their most recent title, role, and contact information, so that I don't have to compare duplicate or outdated entries from different documents.*

# ***5\. Interest Matching, Alerts & Digest***

*(Team Member 4 — Matching, Alerts & Digest)*

*Covers interest matching, meeting following, alert delivery, notification preferences, and the weekly digest.*

***UR-401, EG — See meetings relevant to me.** As a resident, I want to add or remove followed towns, have my choices remembered, and see meetings matching those towns and my saved topics, so that I can find relevant information without checking every meeting.*

***UR-402, EG — Get notified before a meeting.** As a resident, I want to be notified about upcoming meetings relevant to me and changes to their published details, so that I have time to plan how to participate.*

***UR-403, EG — Get notified when meeting records are available.** As a resident, I want an alert when published minutes or a supported recording becomes available for a relevant meeting, so that I know when I can review the official record.*

***UR-404, EG — Follow a specific meeting.** As a resident, I want to follow or unfollow a specific meeting and receive updates about its published documents and any supported agenda items or recordings, so that I can keep up with that meeting in one place.*

***UR-405, EG — Avoid duplicate alerts.** As a resident, I want to avoid receiving repeated alerts about the same meeting update, so that I can focus on new information without unnecessary interruptions.*

***UR-406, EG — Choose when I receive emails.** As a resident, I want to choose whether upcoming meeting notices, meeting material updates, and available minutes or recordings reach me through individual emails or a weekly digest, so that I can stay informed without flooding my inbox.*

***UR-407, EG — Pause or stop emails.** As a resident, I want to pause or turn off emails while still viewing meeting updates in the app, so that I can stay informed on my own schedule.*

***UR-408, EG — Get a weekly meeting summary.** As a resident, I want one weekly email in my chosen time zone summarizing relevant meetings across my followed towns and meetings I follow directly, with a clear message when no eligible updates were found or the check could not be completed, so that I can review upcoming meetings and new materials without checking the site every day.*

# ***6\. Website & User Experience***

*(Team Member 5 — Website & User Experience)*

*Covers the main user interface, dashboard, meeting details and update history, officials directory, search interface, AI-assisted letter drafting, navigation, and responsive layout.*

***UR-501, YA — Local government dashboard.** As a user, I want to view a dashboard of local government activity, so that I can quickly see what is happening in my community.*

***UR-502, YA — Meeting details.** As a user, I want to open a meeting and view its published details, documents, and any supported agenda items or recordings, so that I can review the meeting in one place.*

***UR-503, YA — Meeting update history.** As a user, I want to see the meeting changes Civic Radar has recorded, so that I can understand what changed since it began checking that meeting.*

***UR-504, YA — Officials directory.** As a user, I want to browse a directory of local government officials, so that I can learn who represents my community.*

***UR-505, YA — Official information.** As a user, I want to view information about a specific local official, so that I can learn about their role and relevant voting activity.*

***UR-506, YA — Search.** As a user, I want to search local government information using everyday language, so that I can find relevant meetings, documents, agenda items, and officials without knowing specific government terminology.*

***UR-507, YA — Search results.** As a user, I want to see relevant search results in an organized format, so that I can easily choose the information that is most useful to me.*

***UR-508, YA — AI-assisted letter drafting.** As a user, I want AI to help me draft a letter to a local official about a meeting or agenda item, so that I can more easily communicate my concerns or opinions.*

***UR-509, YA — Edit AI-generated letters.** As a user, I want to review and edit an AI-generated letter before using it, so that the final message reflects what I actually want to say.*

***UR-510, YA — Navigation.** As a user, I want clear navigation between the dashboard, documents, officials, search, and preferences, so that I can easily move through the application.*

***UR-511, YA — Responsive interface.** As a user, I want the website to display properly on different screen sizes, so that I can use Civic Radar on a computer, tablet, or mobile device.*

# ***7\. Constraints and Assumptions***

*●*      *The product is browser-based; no native client is in scope for the semester.*

*●*      *The pilot supports a defined catalog of towns with verified data sources, starting with Salem; residents may follow more than one town.*

*●*      *The platform does **not** provide legal advice, predict political outcomes, or automatically send letters on a user's behalf.*

*●*      *Document ingestion depends on the availability and consistency of each supported town's public records portal (CivicClerk); inconsistent PDF formats are a known risk, not a scope failure.*

*●*      *AI-generated summaries and letter drafts are assistive, not authoritative—users are expected to verify against source documents before relying on them for decisions.*

*●*      *Matching updates and alerts are available in the app regardless of email preferences. Email preferences determine which updates are also delivered through individual emails or the weekly digest. Receiving the same update in the app and through a selected email option is not considered a duplicate alert.*

*●*      *Notification preferences apply to the weekly digest as well as individual email alerts. A weekly digest may summarize updates previously sent as individual alerts; this planned recap is not considered a duplicate alert.*

 

# ***Appendix: Stakeholder Interview Notes***

## ***Erick Gonzalez — Interest Matching, Alerts & Weekly Digest***

***Stakeholder prompt used:** “Act as a realistic stakeholder for this project. Stay in role. Answer my questions, volunteer constraints when relevant, and do not design the software for me.”*

### ***Opening — AI stakeholder introduction***

***AI stakeholder:** Hi Eri, I’m a Salem resident who works full-time. I care about housing costs, parking changes, and construction near my neighborhood, but I don’t have time to read long meeting documents or keep checking the city’s website.*

*What I’d want from Civic Radar is to know **what could affect me, when it’s happening, and whether I still have time to speak up**. Last-minute notices aren’t very useful because I need time to arrange my schedule.*

*I also wouldn’t want constant alerts about everything happening in Salem. If you tell me something important, I need to understand why it matters to me and where the information came from—especially whether it’s just a proposal or something already approved.*

*What would you like to ask me?*

### ***Exchange 1 — Topics to follow***

***Interviewer:** What are some topics you would follow?*

***AI stakeholder:** Eri, the topics I’d probably follow are:*

*●*      ***Housing and affordability:** New housing proposals, affordable housing opportunities, and changes that could affect housing costs.*

*●*      ***Parking and traffic:** Resident parking rules, permit fees, road closures, and changes to busy intersections.*

*●*      ***Construction near my neighborhood:** What’s being proposed, how long work might last, and whether it could cause noise or block access.*

*●*      ***Public transportation:** Changes to bus routes, stops, or service that could affect my commute.*

*●*      ***City spending and fees:** Decisions that could raise what I pay or reduce services I use, like trash collection or the library.*

*Housing and parking would be my priorities. For construction, I’d mostly care about work near my home or commute. A housing policy affecting all of Salem would still matter to me, even if it wasn’t tied to my neighborhood.*

### ***Exchange 2 — Meeting alerts and weekly summaries***

***Interviewer:** Do you want to be notified when there's an ongoing meeting about your topic, or just a weekly summary of what's happening, or maybe both?*

***AI stakeholder:** I’d want both, Eri. A weekly summary would help me keep up with general news, but I wouldn’t want an important meeting or comment deadline to pass while I’m waiting for it.*

*For something I might attend, I’d want to hear **before the meeting—ideally a few days ahead**, so I can plan around work. If it’s already happening when I get the notice, it’s probably too late, though I’d still appreciate it if I could join online.*

*I wouldn’t need live updates throughout the meeting. I’d mainly want to know beforehand what’s being discussed and afterward what was decided. Routine updates could wait for the weekly summary.*

### ***Exchange 3 — In-app updates***

***Interviewer:** Would you like to be updated on the app when something has changed about any of your topics?*

***AI stakeholder:** Yes, Eri. When I open the app, I’d want to know what’s changed since I last checked—for example, if a housing proposal was approved, a meeting moved, or a parking rule’s start date changed. I’d want a clear explanation of **what changed and how it affects me**.*

*I wouldn’t want the same update repeatedly or a notice for every small wording change. Also, I probably wouldn’t check the app every day, so if a meeting gets canceled or a deadline changes, I’d want an email too.*

### ***Exchange 4 — Weekly summary organization***

***Interviewer:** How would you like the weekly summary to be organized?*

***AI stakeholder:** Eri, I’d want **anything I need to act on soon at the top**, like an upcoming meeting or public-comment deadline, with the closest date first.*

*After that, I’d prefer updates grouped by topics I follow—housing, parking, construction—so I can quickly find what interests me. I’d want it to be clear which items are upcoming proposals and which are decisions already made.*

*For each item, a few sentences explaining what happened, why it matters, and what happens next would be enough, with a link if I want details or the original source. Ideally, I could read the whole summary in about five minutes.*

*If there’s nothing new about a topic that week, I wouldn’t need old news repeated just to fill space.*

### ***Exchange 5 — Weeks without updates***

***Interviewer:** If nothing happened on your topics that week, do you still want an email?*

***AI stakeholder:** No, Eri—I’d rather skip the email if there’s nothing new and no upcoming meeting or deadline I need to remember. I already get enough emails.*

*If a meeting or deadline is coming up, though, I’d still appreciate a reminder even if nothing changed that week. And when I check the app, I’d want to know it checked and found no updates, so I’m not wondering whether it stopped working.*

### ***Exchange 6 — Clarifying no-update emails***

***Interviewer:** I see, so you would still want an email telling you there's nothing new?*

***AI stakeholder:** No, Eri—sorry if I wasn’t clear. **I wouldn’t want an email just saying “nothing new.”** I’d be happy to see that when I open the app.*

*I’d only want an email if there’s a new update or an upcoming meeting or deadline worth reminding me about.*

### ***Exchange 7 — Clarifying an empty weekly digest***

***Interviewer:** I meant to ask, would you still want an email telling you there's nothing new in the weekly digest?*

***AI stakeholder:** No, Eri—even for the weekly digest, I’d prefer to **skip that week’s email** if there are no new updates and no upcoming meetings or deadlines to remind me about. I don’t need an email just to tell me it was a quiet week.*

### ***Exchange 8 — Clarifying alerts on opening the app***

***Interviewer:** To be clear, when you enter the app, you would like to see some sort of alert if there are any updates?*

***AI stakeholder:** Yes, Eri. When I open the app, I’d want a clear notice if there are **new updates about the topics or proposals I follow**. I’d want to see what changed and whether I need to do anything, like attend a meeting before a decision is made.*

*If there’s nothing new, a simple “No new updates” message in the app would be enough—I wouldn’t need an email for that.*

### ***Exchange 9 — Vote outcome information***

***Interviewer:** When a vote outcome notification is sent, what exact information would you like to see?*

***AI stakeholder:** Eri, I’d want the notification to tell me:*

*●*      ***What they voted on:** A clear title and a short reminder of what the proposal is about.*

*●*      ***The result:** Was it approved, rejected, or postponed without a final decision?*

*●*      ***Who voted and when:** Which council or committee made the decision, the date, and the vote count.*

*●*      ***What it means for me:** For example, whether parking rules on my street will change.*

*●*      ***What happens next:** When the change takes effect, whether another vote is needed, or whether residents can still comment.*

*●*      ***Where I can check the details:** A link to the official record, including individual officials’ votes if available.*

*I’d especially want it to be clear whether this is **a final decision or just one step in the process**. If some details haven’t been published yet, tell me that instead of making it sound certain.*

### ***Exchange 10 — Repeated status changes***

***Interviewer:** If the same proposal status is updated multiple times within a short period, under what conditions should a second alert be sent?*

***AI stakeholder:** Eri, I’d want a second alert **if something important changed or I need to act differently**. For example:*

*●*      *A meeting’s date, time, or location changes, or it gets canceled.*

*●*      *A public-comment deadline changes.*

*●*      *The proposal moves to a new stage, such as a scheduled vote or a final decision.*

*●*      *An earlier notification had incorrect information that could affect what I do.*

*I wouldn’t want another alert just because the wording changed, another document repeated the same status, or a small detail was added.*

*If several updates happen close together, I’d prefer one notification explaining the latest situation. But if I already received an alert and then the meeting gets canceled, **tell me promptly**—I might already be planning to attend.*

### ***Exchange 11 — Email and in-app duplication***

***Interviewer:** What do you think about receiving the same update in the app and through a selected email option? Would that be duplicate information for you?*

***AI stakeholder:** Eri, I’d be fine seeing the same update in the app and receiving it by email **if I chose that email option**. The email gets my attention when I’m not checking the app, and the app gives me somewhere to find it later.*

*What would bother me is receiving the same email repeatedly or seeing the same update listed several times in the app without anything new happening. Once I’ve read an update in the app, I’d still want to find it later, but it shouldn’t keep appearing as unread.*

### ***Exchange 12 — Joining an ongoing online meeting***

***Interviewer:** Would you also like to know if a meeting is currently being held on Zoom?*

***AI stakeholder:** Yes, Eri—if it’s about something I follow, I’d appreciate knowing **the meeting is happening now, and I can still join on Zoom**.*

*I’d want the joining link and to know whether I can speak or only watch. If public comments are already closed, please make that clear.*

*I’d still prefer advance notice so I can plan, but this would help if I missed the earlier reminder.*

### ***Exchange 13 — Expected app experience***

***Interviewer:** How do you imagine the app working? What do you imagine, or what do you want to do or see, when you are in the app?*

***AI stakeholder:** Eri, I imagine opening the app for a few minutes after work and quickly understanding **what’s happening that matters to me and whether I need to act**.*

*The main things I’d want to do are:*

*●*      ***See what’s new:** Updates about housing, parking, and construction in the area I follow, with a clear distinction between things I’ve read and things I haven’t.*

*●*      ***Check what’s coming up:** Relevant meetings and comment deadlines, with the nearest dates first. I’d want to know how to attend or participate, including an online link if available.*

*●*      ***Understand an issue:** Open an update and read a short explanation of what’s proposed, why it matters, and what happens next, with a link to the official source.*

*●*      ***Follow a particular proposal:** If a parking change affects my street, I’d want to follow its progress and find earlier updates so I understand how it reached its current stage.*

*●*      ***See the outcome:** Know what was decided and whether it’s final or still needs another vote.*

*●*      ***Adjust what I receive:** Change my topics, area, and email preferences if I’m getting too much information or my interests change.*

*If nothing is new, I’d want that to be clear, while still being able to check upcoming meetings and earlier updates.*

*For example, if I see a notice about new parking restrictions near my home, I’d want to understand the change, find out when it will be discussed, and decide whether to attend—all without having to read a long meeting document.*

### ***Exchange 14 — Location information***

***Interviewer:** Would a map telling you the exact location of a change in parking, for example, be useful?*

***AI stakeholder:** Yes, Eri—a map would help me quickly see **whether the parking change affects my street or somewhere I usually park**.*

*I’d want to see the affected stretch of road, since a single pin might make it unclear which spaces or blocks are included. I’d also want a short explanation of the change, when it starts, and whether it’s still proposed or already approved.*

*If the exact location isn’t known, please make that clear. A street name or address alongside the map would help me understand it too.*

### ***Exchange 15 — Accessing the map***

***Interviewer:** How do you imagine that map? A button that appears when a location is possible to show?*

***AI stakeholder:** Yes, Eri—a **“View location” button** on an update would make sense to me when there’s a location available. Before opening it, I’d like to see the street or area name so I can tell whether it’s relevant.*

*For a parking change, I’d expect the map to show the affected part of the street. If the location is only approximate, I’d want that clearly stated. If there’s no location available, a simple “Location not specified” message would be enough.*

### ***Exchange 16 — Weekly digest schedule***

***Interviewer:** Do you have a specific day and time of the week when the weekly email digest should be generated and sent? Or would you like the option to choose that day?*

***AI stakeholder:** Eri, **Sunday around 6 p.m., in my local time**, would work well for me. I could look over what’s coming up before the workweek starts.*

*I’d appreciate being able to choose the day and time, but that wouldn’t be essential for me in the first version. A consistent schedule would be enough, as long as important deadlines reach me in time instead of waiting for the weekly digest.*

### ***Exchange 17 — Undesired behavior***

***Interviewer:** Is there a behavior you would not like to see on this app?*

***AI stakeholder:** Yes, Eri. A few things would make me stop using it:*

*●*      ***Too many alerts:** Repeated notices about the same update or news unrelated to my interests and area.*

*●*      ***Late notifications:** Hearing about a meeting or deadline after I’ve lost the chance to participate.*

*●*      ***Misleading information:** Making a proposal sound approved, guessing missing details, or showing an exact location when it’s uncertain.*

*●*      ***Biased summaries:** Telling me what opinion to have instead of clearly explaining the proposal and its possible effects.*

*●*      ***Ignoring my preferences:** Continuing to email me after I’ve turned emails off or unfollowed a topic.*

*●*      ***Hiding missing information:** Saying “nothing new” when the app actually couldn’t check the government’s latest documents.*

*My biggest concern would be **trusting an update and acting on information that turns out to be wrong**. I’d rather be told something is unconfirmed than have it presented as a fact.*

### ***Exchange 18 — Desired behavior***

***Interviewer:** Is there a behavior you would like to see on this app?*

***AI stakeholder:** Yes, Eri. I’d like the app to **help me stay informed without needing to check it constantly**. I’d especially appreciate it if it:*

*●*      ***Explains why an update matters to me**, such as matching a topic I follow or affecting my neighborhood.*

*●*      ***Makes important changes obvious**, so I can quickly understand what changed since the last update.*

*●*      ***Gives me time to act**, with advance notice of meetings and comment deadlines.*

*●*      ***Keeps track of what I’ve read**, while letting me return to earlier updates.*

*●*      ***Clearly corrects mistakes**, especially if an earlier alert gave me the wrong time, location, or outcome.*

*For example, if a meeting I’m planning to attend moves to another day, I’d want a clear notification showing the old and new dates so I don’t show up at the wrong time.*

### ***Exchange 19 — Read indicators***

***Interviewer:** “**Keeps track of what I’ve read**, while letting me return to earlier updates”. How do you see this? I imagine seeing it gray, with text maybe clarifying “read”?*

***AI stakeholder:** Yes, Eri—a **“Read” label with a less prominent appearance** would make sense to me. Gray could work, as long as the text is still easy to read.*

*I’d expect an update to count as read after I open it, rather than just because it appeared on my screen. I’d still want to open it again later.*

*If something important changes about that proposal afterward, I’d want that **new update clearly marked as unread**, even though I read the earlier one.*

### ***Exchange 20 — New and updated labels***

***Interviewer:** I see. What about "updated" if there's a new update or "news"?*

***AI stakeholder:** Eri, **“Updated” makes more sense to me than “News”** when something has changed about a proposal. “News” feels too general—it doesn’t tell me whether it’s something new or a change to something I already read.*

*I’d understand **“New” for an update I haven’t seen before** and **“Updated” when information I previously read has changed**. I’d also want a short explanation like “Meeting moved to Thursday,” so I immediately know what changed.*

## ***Marcos Salazar — Document Retrieval, Storage, & AI Summarization***

***Stakeholder prompt used:** “Act as a realistic stakeholder for this project. Stay in role. Answer my questions, volunteer constraints when relevant, and do not design the software for me.”*

### ***Opening — AI stakeholder introduction***

***AI Stakeholder:** Hi Marcos — I'm Dana. I write for a small local outlet that covers Salem town government, and I also do some freelance research for a neighborhood association here. My job is basically reading through packets, minutes, and vote records every week and turning them into something residents can actually use.*

*Here's my situation with something like Civic Radar: I already read a lot of primary source documents — that's not new to me. What I need is to get to the right documents faster, and to trust that if I skim an AI summary instead of the full PDF, I'm not going to misquote something or miss a detail that matters for a story. If I ever cite something from this platform, I need to be able to point back to the exact source, because my editor and my readers will ask.*

*A few things up front, since you'll probably want to know where I'm coming from:*

*●*      *I follow more than one town's government, not just Salem, so I'm constantly flipping between sources.*

*●*      *I don't fully trust AI summaries by default — I've been burned by tools that state things too confidently. I'll use a summary to triage what's worth my time, but I verify anything I plan to actually use.*

*●*      *I'm not on this app all day, but when I am, I'm usually looking for something specific — a document, a topic, a date range — not just browsing.*

*●*      *I care about knowing what I don't have yet as much as what I do. If something failed to process or hasn't shown up, I need to know that, not just see silence.*

*What would you like to ask me?*

### ***Exchange 1 — What signals "go read the full PDF"***

***Interviewer:** When you skim a summary to decide if something's worth your time, what's the single piece of information that tells you "yes, read the full PDF"?*

***AI stakeholder:** Honestly, it's anything with a concrete number or a decision attached: a vote outcome, a dollar figure, a name I might quote, or specific language that changed from a prior draft. If the summary flags that something was voted on, funded, or worded a certain way, I go straight to the source. Routine procedural stuff, like "committee reviewed the minutes from the last meeting," I'll usually just trust as-is.*

### ***Exchange 2 — Summary length for quick review vs. skipping the PDF***

***Interviewer:** Would a short summary (2–3 sentences) work to quickly decide if something’s worth your time, or do you need enough detail to sometimes skip the PDF entirely?*

***AI stakeholder:** Two to three sentences is plenty for a quick read, that's all I need to decide if something's relevant to a story I'm tracking. But I wouldn't skip the PDF entirely on anything I'm actually going to write about. For stuff outside my beat that I'm just keeping tabs on, sure, a short summary is enough on its own.*

### ***Exchange 3 — How precise does source linking need to be***

*Interviewer: You mentioned verifying anything you plan to use, does that mean you want the summary to point to a specific page or section of the PDF, or is a link to the document as a whole enough?*

***AI stakeholder:** A link to the document as a whole is the minimum I'd need to actually use this. But if it could point me to roughly the right page or section, that would save me a lot of time. Some of these packets run forty-plus pages, and hunting for one paragraph eats into my afternoon. Not a dealbreaker if that's not there for the first version, just something I'd ask for down the line.*

### ***Exchange 4 — Automatically flagged details***

***Interviewer**: Would it help if the summary flagged specific things automatically, like dollar amounts, vote outcomes, or dates, separately from the prose?*

***AI stakeholder:** That would genuinely help. Dollar figures and vote tallies are usually the first things an editor asks me about, so having those called out separately instead of buried in a paragraph would let me scan a dozen documents a lot faster than reading full prose summaries for each one.*

### ***Exchange 5 — Being burned by an over-confident summary***

***Interviewer:** Have you been burned by a summary stating something "too confidently" before? Can you give an example of what that looked like, so I know what to avoid?*

***AI stakeholder:** Yeah. A different tool I used once summarized a budget line as "approved" when it was actually still a staff recommendation waiting on a committee vote. I nearly repeated that in a draft before double-checking the minutes myself. That's the kind of mistake that costs me credibility, not just time.*

### ***Exchange 6 — Confidence indicator***

***Interviewer:** Would you want any signal of how confident the AI is in a summary, or would that just add noise you'd ignore anyway?*

***AI stakeholder:** A numeric confidence score would probably just be noise to me. I wouldn't know what to do with "82% confident." What I actually need is much simpler: a clear label for whether something is a final decision or still proposed/pending. That distinction is what actually protects me from repeating the mistake I just described.*

### ***Exchange 7 — Telling documents apart at a glance***

***Interviewer:** When you're scanning a list of documents, what besides the name and date helps you tell them apart at a glance, meeting type, body/committee, town?*

***AI stakeholder:** Which body or committee it's from matters a lot to me. School committee, city council, planning board, those are very different beats even within the same town. Meeting type matters too, since a special hearing usually means something more urgent than a regular monthly meeting.*

### ***Exchange 8 — Sort order preferences***

***Interviewer:** Is "most recent first" always what you want, or do you sometimes want oldest-first (e.g., tracing how an issue developed)?*

***AI stakeholder:** Most recent first is what I want day to day, for sure. But when I'm working on a feature piece tracing how an issue developed over several months, I want to be able to flip that around or otherwise reconstruct the timeline. Losing that ability entirely would be annoying for that kind of story.*

### ***Exchange 9 — Does total document count matter***

***Interviewer:** Does the total document count matter to you day-to-day, or is that more of a "just curious" number?*

***AI stakeholder:** Just curious, mostly. It's not something I'd check routinely, maybe a sanity check if I suspected the platform had fallen behind on pulling new documents, but not part of my regular workflow.*

### ***Exchange 10 — Treating document types differently***

***Interviewer:** Do you distinguish between document types, agendas, minutes, packets, in how you use them, or do you treat them the same?*

***AI stakeholder:** Very differently. Agendas tell me what's coming up, minutes and packets tell me what already happened. If everything's just lumped together as "documents" with no type label, I'd have to open each one just to figure out which kind it is, and that adds up fast across several towns.*

### ***Exchange 11 — How she actually searches***

***Interviewer:** Search by title is in scope for this semester, realistically, do you usually remember a document's exact title, or do you search by topic, date, or meeting type instead?*

***AI stakeholder:** Almost never the exact title. I'd be searching by topic, "housing," "parking permits," or by committee name, sometimes a date range if I know roughly when something was discussed. Title-only search would be pretty limited for how I actually work.*

### ***Exchange 12 — Fallback when search comes up empty***

***Interviewer:** If title search comes up empty, what's your fallback, do you give up, browse the list manually, or go back to CivicClerk directly?*

***AI stakeholder:** I'd browse the sorted list manually first, since I usually have a rough date in mind. If I still can't find it after a few minutes, I'd go straight to CivicClerk myself. That's the kind of thing that quietly erodes my trust in the platform, though. If I have to keep falling back to the original source, I start wondering what else I'm missing.*

### ***Exchange 13 — Search scope across towns***

***Interviewer:** Since you follow multiple towns, would you want to search within one town at a time, or across all of them at once by default?*

***AI stakeholder:** My instinct is I'd want search across all my towns by default, with the option to narrow to one when I'm working a specific story. I know that edges into how the multi-town list itself is organized, so I'll leave the actual mechanics to whoever owns that. I'm just telling you what I'd expect as a user.*

### ***Exchange 14 — Reading in-app vs. downloading***

***Interviewer:** When you open a PDF in the app, do you read it there, or do you basically always download it to read elsewhere?*

***AI stakeholder:** Depends on length. Something short, a few pages, I'll read right in the browser. Longer packets I download, because I like to highlight and annotate in my own PDF reader when I'm actually researching something. That's just part of how I work.*

### ***Exchange 15 — PDF load failure***

***Interviewer:** If a PDF fails to load, what do you want to be able to do next, retry, download instead, or just know to check CivicClerk directly?*

***AI stakeholder:** I'd want the option to try downloading it directly instead of just staring at a broken viewer. And I'd want it clear that the failure is on the platform's end, not my connection, so I know whether to wait and check back or just go to CivicClerk right away.*

### ***Exchange 16 — Bulk downloading***

***Interviewer:** Do you ever need to download several documents at once, or is one-at-a-time realistic for how you work?*

***AI stakeholder:** One at a time covers most of my day-to-day work. For a bigger investigative piece I'd sometimes want several related documents together, but that's the exception, not something I'd need for a first version.*

### ***Exchange 17 — Expectations around "pending"***

***Interviewer:** When a document shows as "summary pending," do you want any sense of how long that usually takes, or is "pending" enough on its own?*

***AI stakeholder:** I don't need an exact ETA, but if I check back an hour later and it's still just sitting there pending with no way to read the PDF in the meantime, that's a problem. "Pending" needs to feel like it's actually moving, not like a dead end.*

### ***Exchange 18 — Does the failure reason matter***

***Interviewer:** If a summary fails, does it matter to you why it failed, or do you just need to know it failed so you can go read the PDF instead?*

***AI stakeholder:** I don't need the technical reason. I just need a clear, unambiguous "this failed" so I know to stop waiting and go read the source myself.*

### ***Exchange 19 — Manual retry***

***Interviewer:** Would you ever want to trigger a retry yourself, or is that something you'd expect to just happen automatically?*

***AI stakeholder:** I'd like the option, especially if I'm on deadline and don't want to just wait around for whatever automatic schedule it's on. Not a dealbreaker if it's automatic-only, but it'd be nice to have some control.*

### ***Exchange 20 — Checking frequency and why auto-appearing matters***

***Interviewer:** How often do you actually check for new documents, is "automatically appearing" mainly about not missing something, or about saving you the trip to CivicClerk?*

***AI stakeholder:** Some weeks daily, quieter weeks maybe every few days. For me it's really about not missing something. I cover several towns, and I can't reliably remember to manually check each one's CivicClerk page on top of everything else I'm doing.*

### ***Exchange 21 — What counts as "recent"***

***Interviewer:** What counts as "recent" to you, hours, a day, a week? Does the retrieval timestamp change how you treat a document?*

***AI stakeholder:** Same-day or the day before still feels recent to me. Once it's a few days old I start being more cautious, wondering if there's a newer version I'm missing, especially close to a vote.*

### ***Exchange 22 — Retrieved vs. originally published date***

***Interviewer:** Is it more important to know when a document was retrieved by the platform, or when it was originally published by the town?*

***AI stakeholder:** The original publish date matters more for my actual reporting, that's the date I'd cite. But the retrieval timestamp matters for my trust in the platform itself, so I know the pipeline hasn't stalled out somewhere.*

### ***Exchange 23 — Keeping towns straight in a combined list***

***Interviewer:** When documents from different towns are combined in one list, how do you want to keep them straight, a visible tag, color, grouping, or filter?*

***AI stakeholder:** A visible tag or label is the baseline I'd need. Being able to filter down to just one town would matter more to me day-to-day than color alone. Color's nice, but I'd still want a way to narrow the list when I'm focused on one place.*

### ***Exchange 24 — Comparing towns on the same issue***

***Interviewer:** Do you ever compare how two towns are handling a similar issue, or does each town stay a separate, unrelated stream for you?*

*AI stakeholder: Occasionally, for a regional story, say a few towns all dealing with a housing measure around the same time. But that's the exception. Most days each town is its own separate stream for me.*

### ***Exchange 25 — Admin progress view***

***Interviewer:** That admin-facing "X summarized, Y pending" view, is that something you, personally, would ever want to see, or is that purely a backend/admin concern for you?*

***AI stakeholder:** That's not something I'd care about personally. I only care if it's affecting me directly, like a specific document sitting pending too long. The overall processing count is someone else's problem to watch.*

### ***Exchange 26 — Biggest unaddressed factor***

***Interviewer:** Is there anything about how documents get from CivicClerk into your hands that we haven't touched on that would make or break whether you'd actually use this?*

***AI stakeholder:** The thing that would really make or break it for me is consistency of source attribution. If I can't reliably trace every claim back to an exact document, I can't use this for anything I actually publish. It'd just become something I glance at for awareness, not a tool I rely on for my work.*

### ***Exchange 27 — What she'd cut first***

***Interviewer:** If you had to cut one of the things we just discussed to ship something in a few weeks, which would you be least upset to lose?*

***AI stakeholder:** Bulk downloading and page-level linking are the two I'd let go of first, those are nice-to-haves. What I wouldn't want cut is document type labeling, town tagging, clear pending/failed states, and the link back to the source. Those are what make this usable for my actual work, not just browsing.*

### ***Exchange 28 — What would break her trust entirely***

***Interviewer**: What would make you stop trusting this part of the platform entirely?*

***AI stakeholder:** If a summary ever presented something as decided when it wasn't, like that "approved" mix-up I mentioned earlier, and it happened more than once, I'd stop trusting the summaries altogether. At that point I'd just use the platform as a raw document index and go back to reading everything myself, which honestly defeats the purpose for me.*

## ***Kailun Ju — Platform & Jurisdictions***

*Stakeholder prompt used: "Act as a realistic stakeholder for this project. Stay in role. Answer my questions, volunteer constraints when relevant, and do not design the software for me."*

***Opening — AI stakeholder introduction***

*AI stakeholder: Hi Kailun, I'm Rosa. I've lived in Salem for about twelve years, and I coordinate a small neighborhood association near downtown. We have four volunteers who take turns keeping an eye on city council, planning board, and school committee meetings so we can tell our neighbors what's coming up.*

*Right now that means someone checks the city's website every week, downloads the agendas, and posts a summary in our group chat. It works, but it depends on whoever remembers to do it, and things fall through the cracks when someone is busy.*

*A few things matter to me. First, I don't want to set up the same thing four times for four volunteers. Second, what I follow says a lot about my politics and where I live, so I care about who can see my account. Third, I need to know the app is actually working. If it's quiet, I want to know it's quiet because nothing happened, not because something broke.*

*What would you like to ask me?*

***Exchange 1 — Topics to follow***

***Interviewer:** What local issues would you want to follow, and how many would you realistically keep track of?*

***AI stakeholder:** Housing, parking, and the school budget are my big three. For the association, we also watch zoning and anything about the waterfront. So personally maybe three, and for the group five or six. More than that and I'd stop reading, because everything would start to feel equally important.*

***Exchange 2 — How specific topics should be***

***Interviewer:** How specific should topics be? For example, is "Housing" enough, or would you want something narrower like "Affordable housing"?*

***AI stakeholder:** "Housing" is fine for me. If you split it into five kinds of housing, I'd end up selecting all five anyway because I wouldn't know which one a proposal falls under. What I'd hate is picking a narrow topic and then missing something because the city filed it under a slightly different name.*

***Exchange 3 — Changing interests***

***Interviewer:** How often do you think your interests would change, and what would make you update them?*

***AI stakeholder:** Not often. Maybe a couple of times a year. Usually it's because something comes up in the neighborhood, like a proposed development on our street, and suddenly I care about zoning for a few months. When that's over, I'd want to drop it just as easily. It should take seconds, not a whole setup process.*

***Exchange 4 — Trusting an empty view***

***Interviewer:** If you open the app and see no new meetings, what would make you trust that nothing actually happened?*

***AI stakeholder:** I'd want to see when the app last checked the city, something like "Checked this morning." If I see that, I'll believe it's a quiet week. If there's nothing on the screen and no sign of when it last checked, I'd assume it's broken and go back to the city website myself, which defeats the purpose.*

***Exchange 5 — How recent is recent***

***Interviewer:** How recent does information need to be before you'd start doubting it?*

***AI stakeholder:** If it checked within the last day, I'm fine. Two or three days without a check, especially the week before a council meeting, and I'd get nervous. Agendas are usually posted only a few days ahead, so a stale check could mean I miss the whole window to show up.*

***Exchange 6 — When the town website can't be reached***

***Interviewer:** If the platform couldn't reach the town's website, how would you want to find out?*

***AI stakeholder:** Just tell me plainly, on the same screen where I'd normally see the meetings. Something like "We couldn't check Salem." I don't need the technical reason. What I don't want is for it to look exactly the same as a quiet week, because then I'd make the wrong call.*

***Exchange 7 — Using the app as a team***

***Interviewer:** If you worked at a local newspaper or community group, how would your team use a tool like this together?*

***AI stakeholder:** For us, the main thing is that we all see the same meetings. Right now we split the work by government body, but really we just want everyone looking at the same list of what matters to the neighborhood. Then whoever has time that week can go to a meeting or write the update.*

***Exchange 8 — Who manages the team***

***Interviewer:** Who in your organization should be allowed to add or remove people, and who should just use the tools?*

***AI stakeholder:** Me and maybe one other person should be able to add or remove volunteers. Volunteers come and go, sometimes on short notice, so I need to be able to do it myself without waiting on anyone. Everyone else just needs to read and follow meetings.*

***Exchange 9 — Everyone with the same access***

***Interviewer:** What would go wrong if everyone on your team had the same level of access?*

***AI stakeholder:** Honestly, probably nothing on purpose, but mistakes happen. A new volunteer could remove someone by accident or change what the whole group follows without telling anyone. We had something similar happen with our shared email list once, and it took weeks to notice. I'd rather keep those powers with a couple of people.*

***Exchange 10 — Shared or individual follows***

***Interviewer:** Would your team want to follow the same towns and topics, or would each person follow their own?*

***AI stakeholder:** Both. The association has its core topics that everyone should see, like zoning and housing. But one of our volunteers is a parent and also cares about school stuff that the group doesn't track. So there should be a shared set, and people should still be able to add their own on top.*

***Exchange 11 — Hiding shared topics***

***Interviewer:** If your organization set shared topics, should you be able to hide ones you personally don't care about?*

***AI stakeholder:** For the association, I'd actually prefer that people can't drop the shared ones, because the whole point is that nobody misses them. But I can see a volunteer being annoyed by that. Maybe it's fine as long as it's clear why the topic is there, like a note saying it comes from the group.*

***Exchange 12 — Leaving the organization***

***Interviewer:** If you left the organization, what would you expect to happen to what you were following?*

***AI stakeholder:** The group's topics should go away, since I'm not part of it anymore. But anything I added myself should stay. I'd be annoyed if leaving the group wiped out my personal settings. That feels like losing something that was mine.*

***Exchange 13 — How often the town and topic lists change***

***Interviewer:** As someone running the platform, how often do you think the list of towns, topics, or government bodies would need to change?*

***AI stakeholder:** I'm not the one running it, but from the outside, committees change more than people think. Salem creates a task force or renames a committee every so often. Topics probably change less. I'd expect those updates to show up quickly, not months later, because an outdated list makes the whole thing feel abandoned.*

***Exchange 14 — Removed topics and towns***

***Interviewer:** What should happen to residents who follow a topic or town that gets removed?*

***AI stakeholder:** It should stop showing up, but I'd want to know about it. If I'm following a topic and it silently disappears, I'd think I'm still covered when I'm not. A short notice would be enough, like "Waterfront is no longer available."*

***Exchange 15 — Setting up a new town***

***Interviewer:** What information would you need before you'd trust that a new town's data is set up correctly?*

***AI stakeholder:** I'd want to see that it's pulling the right town's meetings and that the times are right. If a meeting time is off by an hour, that's worse than no information, because I'd show up late or miss it. Whoever adds a town has to get the basics right before anyone relies on it.*

***Exchange 16 — Account activity to review***

***Interviewer:** What kinds of account activity would you want to be able to review, and why?*

***AI stakeholder:** Sign-ins, mainly, and any changes to my settings. If my followed topics or my email preferences changed and I didn't do it, I'd want to know. For the association, I'd also want to see if anyone's access level changed, since that affects what they can do to the group.*

***Exchange 17 — How far back history goes***

***Interviewer:** How far back would you want to see your account history?*

***AI stakeholder:** A few months would be nice, but realistically I'd only look if something seemed off, and then I'd care about the last couple of weeks. I'm not going to scroll through years of sign-ins. The recent stuff is what matters.*

***Exchange 18 — Signs of someone else using the account***

***Interviewer:** What would make you suspicious that someone else was using your account?*

***AI stakeholder:** A sign-in at a time I know I wasn't online, like the middle of the night, or settings I never touched suddenly being different. If I stopped getting emails, I'd wonder whether someone turned them off. I'd want the history to show when each thing happened so I can match it to my own memory.*

***Exchange 19 — Suspension versus deletion***

***Interviewer:** In what situations do you think an account should be suspended instead of deleted?*

***AI stakeholder:** If someone's account was hacked, or if there was a complaint that still needs to be looked into. Deleting feels too final for those. People make mistakes, and a hacked account isn't the owner's fault. Deletion should really be something the person chooses themselves.*

***Exchange 20 — Suspended by mistake***

***Interviewer:** If your account were suspended by mistake, what would you expect to happen to your settings and followed topics?*

***AI stakeholder:** Everything should be exactly where I left it when it's restored. If I had to set everything up again, I'd be frustrated, and for the association it would mean redoing the group's setup too. A mistake shouldn't cost me my work.*

***Exchange 21 — Telling users why***

***Interviewer:** Should a suspended user be told why their account was suspended?*

***AI stakeholder:** Yes, at least in general terms. If I just get locked out with no explanation, I'd assume the app is broken. Even "Your account has been suspended. Contact us for help" would be better than nothing. I understand you might not share every detail if it's about abuse, though.*

***Exchange 22 — First sign-in***

***Interviewer:** The first time you sign in, what would you want to see or be asked to do?*

***AI stakeholder:** I'd want it to ask me which town I care about and what topics, right away. If I land on an empty screen, I won't know what I'm supposed to do next. But keep it short. If the setup takes more than a minute or two, I'll probably close it.*

***Exchange 23 — Set up now or explore first***

***Interviewer:** Would you rather set up your towns and topics right away, or explore the app first?*

***AI stakeholder:** Set it up right away for me. But one of my volunteers is the type who clicks around first, so there should be a way to skip it. Just don't force people through a long process before they can see anything.*

***Exchange 24 — Reminders after skipping***

***Interviewer:** If you skipped setup at first, how would you want to be reminded later?*

***AI stakeholder:** A simple message on the main screen saying I haven't picked a town yet, with a way to do it right there. Not a pop-up every time I open the app. That would get old fast and I'd stop opening it.*

***Exchange 25 — What would make me stop using it***

***Interviewer:** Is there anything about managing your account or preferences that would make you stop using the app?*

***AI stakeholder:** If my settings didn't stick. If I pick my topics and they're gone the next time I sign in, I'd lose trust immediately. The other thing is privacy. If I thought other people could see what issues I follow, I'd stop using it for anything sensitive.*

***Exchange 26 — Most important features***

***Interviewer:** If we could only build a few of these features this semester, which would matter most to you?*

***AI stakeholder:** Choosing my topics and having them saved, and knowing when the app last checked the city. Those two decide whether I trust it at all. After that, the shared setup for the association, because that's what would actually replace our group chat. The account history and admin tools matter, but I wouldn't notice them day to day.*

