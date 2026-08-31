# Security Policy

## Scope

carma is a monorepo of libraries and web applications for public sector GIS. This policy covers the source code in this repository. It does not cover the servers, data or WMS/WFS services operated by the municipalities that run carma-based applications. If a report concerns a hosted instance rather than the code, we will forward it to the responsible operator.

## Supported versions

There are no long-lived release branches. Fixes go to `dev` and reach production through the normal deployment pipeline. Only the current state of `dev` and the applications currently deployed from it are supported. We do not backport security fixes to older commits or to earlier states of a deployed application.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting on this repository ("Security" tab, then "Report a vulnerability"). This is the preferred channel because it keeps the report, the discussion and the fix in one place.

If you cannot use GitHub, send the report by email to opensource@cismet.de.

A useful report contains the affected application or library, the commit or deployed URL you tested, the steps to reproduce, and what an attacker gains. Proof-of-concept code helps. Please report in English or German.

## What happens next

We confirm receipt within five working days and tell you whether we consider the report in scope. We keep you informed while we work on a fix, and we let you know when the fix is deployed. We ask you to keep the report private until then.

We do not run a bug bounty programme and cannot pay for reports. If you want to be named in the release notes or the advisory, say so in your report.

## Out of scope

Reports that consist only of automated scanner output without a demonstrated impact, missing security headers with no exploitable consequence, findings that require a compromised end-user device, and social engineering of cismet staff or municipal employees.

## Sinngemäße Übersetzung (nicht offiziell)

Die englische Fassung oben ist die verbindliche. Der folgende Text fasst sie auf Deutsch zusammen und ersetzt sie nicht.

Diese Richtlinie gilt für den Quellcode in diesem Repository. Server, Daten und Kartendienste der Kommunen, die carma-Anwendungen betreiben, fallen nicht darunter. Betrifft eine Meldung eine laufende Installation statt des Codes, leiten wir sie an den Betreiber weiter.

Es gibt keine langlebigen Release-Zweige. Korrekturen gehen nach `dev` und kommen über die übliche Deployment-Pipeline in Betrieb. Unterstützt wird nur der aktuelle Stand von `dev` und die daraus derzeit ausgelieferten Anwendungen. Ältere Stände bekommen keine nachgezogenen Sicherheitskorrekturen.

Bitte melde eine vermutete Sicherheitslücke nicht als öffentliches Issue, sondern über die private Meldefunktion von GitHub im Reiter "Security" unter "Report a vulnerability". Wenn das nicht geht, per E-Mail an die im englischen Abschnitt genannte Adresse.

Hilfreich sind: betroffene Anwendung oder Bibliothek, getesteter Commit oder URL, Schritte zum Nachstellen und die Frage, was ein Angreifer damit erreicht. Deutsch und Englisch sind beide willkommen.

Wir bestätigen den Eingang innerhalb von fünf Werktagen und sagen, ob die Meldung in den Geltungsbereich fällt. Bis zur behobenen und ausgelieferten Lücke bitten wir darum, die Meldung vertraulich zu behandeln. Ein Bug-Bounty-Programm gibt es nicht. Wer namentlich genannt werden möchte, schreibt das in die Meldung.

Nicht bearbeitet werden reine Scanner-Ausgaben ohne gezeigte Auswirkung, fehlende Sicherheits-Header ohne ausnutzbare Folge, Funde, die ein bereits kompromittiertes Endgerät voraussetzen, und Social Engineering gegenüber Mitarbeitern von cismet oder der Kommunen.
