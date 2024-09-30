<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>velocity</sld:Name>
    <sld:UserStyle>
      <sld:Name>velocity</sld:Name>
      <sld:Title>velocity style</sld:Title>
      <sld:Abstract>Classic color progression</sld:Abstract>
      <sld:FeatureTypeStyle>
        <sld:Name>name</sld:Name>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:Opacity>0.9</sld:Opacity>
            <sld:ColorMap>
              <sld:ColorMapEntry color="#FFFFFF" opacity="0.0" quantity="0.0" label="0 m/s"/>
              <sld:ColorMapEntry color="#BEC356" quantity="0.4" label="0.4 m/s"/>
              <sld:ColorMapEntry color="#DA723E" quantity="0.6" label="0.6 m/s"/>
              <sld:ColorMapEntry color="#D64733" quantity="2" label="2 m/s"/>
              <sld:ColorMapEntry color="#8F251B" quantity="4" label="4 m/s"/>
              <sld:ColorMapEntry color="#8F251B" quantity="200" label="&gt;5 m/s"/>
            </sld:ColorMap>
            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>