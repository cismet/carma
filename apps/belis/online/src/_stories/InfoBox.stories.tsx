import React, { useState, useRef, useEffect } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import NewWindowControl from "react-cismap/NewWindowControl";
import ContactButton from "react-cismap/ContactButton";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import FeatureCollection from "react-cismap/FeatureCollection";
import { storiesCategory, parkscheinautomatenfeatures } from "./StoriesConf";
import Form from "react-bootstrap/Form";
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Card from 'react-bootstrap/Card'
import ListGroup from 'react-bootstrap/ListGroup';
import CloseButton from 'react-bootstrap/CloseButton'
// import { render } from "mson-react";
//import compiler from "mson/lib/compiler";

export default {
  title: storiesCategory + "InfoBoxes",
};
const mapStyle = {
  height: window.innerHeight - 100,
  cursor: "pointer",
  clear: "both",
};

export const SimpleTopicMapWithDefaultInfoBox = (args) => {
  return (
    <TopicMapContextProvider items={parkscheinautomatenfeatures} appKey="SimpleTopicMapWithDefaultInfoBox">
      <TopicMapComponent
        style={mapStyle}
        infoBox={<GenericInfoBoxFromFeature pixelwidth={400} />}
        fullScreenControl={args.FullScreen}
        locatorControl={args.LocateControl}
      >
        {args.NewWindowControl && <NewWindowControl />}
        {args.ContactButton && (
          <ContactButton
            title='Cooltip ;-)'
            action={() => {
              window.alert("contact button pushed");
            }}
          />
        )}

        <FeatureCollection />
      </TopicMapComponent>
    </TopicMapContextProvider>
  );
};

SimpleTopicMapWithDefaultInfoBox.args = {
  FullScreen: false,
  LocateControl: false,
  NewWindowControl: false,
  ContactButton: false,
};

export const SimpleInfoBox = () => (
  <div>
    <h1>Coming Soon</h1>
  </div>
);
export const SimpleInfoBox2 = () => <h3>Coming Soon</h3>;



export const MalfunctionDialog = () => {
  return (
    <Card style={{ width: '30rem' }}>
      <Card.Header>
        <CloseButton />
        <Card.Title>Störung melden</Card.Title>
        </Card.Header>
      <Form>
        <Form.Group className="mb-3" controlId="formBasicEmail">
          <Form.Label>Bezeichnung</Form.Label>
          <Form.Control type="text" placeholder="Bezeichnung" />
        </Form.Group>
        <ButtonGroup aria-label="Basic example">
          <Button variant="secondary">nur Veranlassung</Button>
          <Button variant="secondary">Einzelauftrag</Button>
        </ButtonGroup>

        <Form.Group className="mb-3" controlId="formBasicEmail">
          <Form.Label>Beschreibung</Form.Label>
          <Form.Control as="textarea" placeholder="Beschreibung" />
        </Form.Group>

        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Form.Label>Bemerkung</Form.Label>
          <Form.Control as="textarea" placeholder="Bemerkung" />
        </Form.Group>

        <Card.Header>Fotos</Card.Header>
        <ListGroup variant="flush">
          <ListGroup.Item>Fotos erstellen</ListGroup.Item>
          <ListGroup.Item>Fotos auswählen</ListGroup.Item>
        </ListGroup>
      </Form>
    </Card>      
  )
};
