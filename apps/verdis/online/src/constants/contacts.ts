const contacts = new Map();

contacts.set('BeckerB102', {
  anrede: 'Frau',
  vorname: 'Bettina',
  nachname: 'Becker',
  telefon: '+49-202-563 5964',
  mail: 'bettina.becker@stadt.wuppertal.de',
});
contacts.set('MetzKK102', {
  anrede: 'Frau',
  vorname: 'Kira Kristin',
  nachname: 'Metz',
  telefon: '+49-202-563 4274',
  mail: 'kira.metz@stadt.wuppertal.de',
});
contacts.set('AckermannS102', {
  anrede: 'Frau',
  vorname: 'Simone',
  nachname: 'Ackermann',
  telefon: '+49-202-563 4274',
  mail: 'simone.ackermann@stadt.wuppertal.de',
});
contacts.set('SchommersM102', {
  anrede: 'Frau',
  vorname: 'Monja',
  nachname: 'Schommers',
  telefon: '+49-202-563 4898',
  mail: 'monja.schommers@stadt.wuppertal.de',
});
contacts.set('RohdeT102', {
  anrede: 'Frau',
  vorname: 'Tanja',
  nachname: 'Rohde',
  telefon: '+49-202-563 6738',
  mail: 'tanja.rohde@stadt.wuppertal.de',
});
contacts.set('ThaederA102', {
  anrede: 'Herr',
  vorname: 'Achim',
  nachname: 'Thäder',
  telefon: '+49-202-563 5998',
  mail: 'achim.thaeder@stadt.wuppertal.de',
});
contacts.set('SteinbacherD102', {
  anrede: 'Herr',
  vorname: 'Dirk',
  nachname: 'Steinbacher',
  telefon: '+49-202-563 5794',
  mail: 'dirk.steinbacher@stadt.wuppertal.de',
  image: 'SteinbacherD102.png',
});
contacts.set('HecknerA102', {
  anrede: 'Frau',
  vorname: 'Anke',
  nachname: 'Heckner',
  telefon: '+49-202-563 6583',
  mail: 'anke.heckner@stadt.wuppertal.de',
});
contacts.set('FischerI403', {
  anrede: 'Frau',
  vorname: 'Iris',
  nachname: 'Fischer',
  telefon: '+49-202-563 6339',
  mail: 'iris.fischer@stadt.wuppertal.de',
});
contacts.set('DavidOsbarB102', {
  anrede: 'Frau',
  vorname: 'Bärbel',
  nachname: 'David-Osbar',
  telefon: '+49-202-563 6637',
  mail: 'baerbel.david-osbar@stadt.wuppertal.de',
  image: 'DavidOsbarB102.png',
});
contacts.set('PytlikS102', {
  anrede: 'Frau',
  vorname: 'Sabina',
  nachname: 'Pytlik',
  telefon: '+49-202-563 5986',
  mail: 'sabina.pytlik@stadt.wuppertal.de',
});

contacts.set('PytlikSa102', {
  anrede: 'Frau',
  vorname: 'Sabina',
  nachname: 'Pytlik',
  telefon: '+49-202-563 5638',
  mail: 'sabina.pytlik@stadt.wuppertal.de',
});

export default contacts;

export const defaultContact = 'SteinbacherD102';

//=VERKETTEN("contacts.set('";A2;"',{ 'anrede': '";B2;"', 'vorname': '";C2;"', 'nachname': '";D2;"', 'telefon': '+49-202-"; E2;"', 'mail': '";F2;"'});")
