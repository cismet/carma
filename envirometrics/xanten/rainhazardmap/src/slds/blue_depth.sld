<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>depth-blue</sld:Name>
    <sld:UserStyle>
      <sld:Name>depth-blue</sld:Name>
      <sld:Title>maximale Wassertiefe</sld:Title>
      <sld:Abstract>maximale Wassertiefe der Simulation</sld:Abstract>
      <sld:FeatureTypeStyle>
        <sld:Name>name</sld:Name>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ColorMap>
              <sld:ColorMapEntry color="#FFFFFF" opacity="0.0" quantity="0.0" label="0cm"/>
              <sld:ColorMapEntry color="#88B2EA" opacity="0.75" quantity="0.05" label="0cm"/>
              <sld:ColorMapEntry color="#508CE0" opacity="0.75" quantity="0.200" label="20cm"/> 
              <sld:ColorMapEntry color="#3266B4" opacity="0.75" quantity="0.400" label="40cm"/> 
              <sld:ColorMapEntry color="#5018B3" opacity="0.75" quantity="0.600" label="60cm"/> 
              <sld:ColorMapEntry color="#7B20B5" opacity="0.75" quantity="1.400" label="140cm"/>
              <sld:ColorMapEntry color="#7B20B5" opacity="0.75" quantity="1000" label="&gt;300cm"/>
            </sld:ColorMap>
            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>