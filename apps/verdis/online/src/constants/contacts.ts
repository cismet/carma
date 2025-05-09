const contacts = new Map();

contacts.set("BeckerB102", {
  anrede: "Frau",
  vorname: "Bettina",
  nachname: "Becker",
  telefon: "+49-202-563 5964",
  mail: "bettina.becker@stadt.wuppertal.de",
});

contacts.set("SchommersM102", {
  anrede: "Frau",
  vorname: "Monja",
  nachname: "Schommers",
  telefon: "+49-202-563 4898",
  mail: "monja.schommers@stadt.wuppertal.de",
});
contacts.set("RohdeT102", {
  anrede: "Frau",
  vorname: "Tanja",
  nachname: "Rohde",
  telefon: "+49-202-563 6738",
  mail: "tanja.rohde@stadt.wuppertal.de",
});

contacts.set("PytlikS102", {
  anrede: "Frau",
  vorname: "Sabina",
  nachname: "Pytlik",
  telefon: "+49-202-563 5986",
  mail: "sabina.pytlik@stadt.wuppertal.de",
});
contacts.set("CajicR102", {
  anrede: "Frau",
  vorname: "Ruzica",
  nachname: "Cajic",
  telefon: "+49-202-563 5794",
  mail: "ruzica.cajic@stadt.wuppertal.de",
});
contacts.set("AkinI102", {
  anrede: "Herr",
  vorname: "Ismail",
  nachname: "Akin",
  telefon: "+49-202-563 4898",
  mail: "ismail.akin@stadt.wuppertal.de",
});

export default contacts;

export const defaultContact = "SteinbacherD102";

//=VERKETTEN("contacts.set('";A2;"',{ 'anrede': '";B2;"', 'vorname': '";C2;"', 'nachname': '";D2;"', 'telefon': '+49-202-"; E2;"', 'mail': '";F2;"'});")
