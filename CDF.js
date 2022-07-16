var NJ = ee.FeatureCollection('users/tahyrb/State_Boundary_of_NJ'); // gets the boundary of NJ

var counties = ee.FeatureCollection('users/tahyrb/County_Boundaries_of_NJ') // gets the counties of NJ

Map.addLayer(counties,{color:'black'},'counties'); // add the counties layer to the map for visulization

Map.setOptions('HYBRID'); // set map to Satellite


var dataset = ee.ImageCollection('NASA_USDA/HSL/SMAP10KM_soil_moisture')
                  .filter(ee.Filter.date('2015-04-02', ee.Date(new Date().getTime()))); //filters the date from first observation to latest observation
               
var soilMoisture1 = dataset.select('ssm');


var dataset_list = soilMoisture1.toList(soilMoisture1.size());   // convert the image collection to the list

var latestIMG = dataset_list.get(dataset_list.size().subtract(1));  // gets the lastest image in the image collection

var dataset_list1 = dataset_list.remove(latestIMG);   // removes the latest image from the image collection

var soilMoisture = ee.ImageCollection(dataset_list1);   // convert the list back to an image collection without the latest image


var soilMoistureVis = {
  min: 0.0,
  max: 26.0,
  palette: ['ff0303','efff07','efff07','418504','0300ff'], //choose range of colors in pallete (hexadecimal values) to represent the amount of soil moisture in a given area on the map.
  opacity: 0.6
    
};


var soilMoistureNJ = soilMoisture.map(function(image) { return image.clip(NJ); }); // goes through the image collection and clips each image around NJ boundary

Map.addLayer(soilMoistureNJ, soilMoistureVis, 'Soil Moisture NJ'); // adds SMAP layer to map


Map.setCenter(-74.724167,40.072778, 8)  //adds center to NJ


///////////////////////////////////////////Drawing tools////////////////////////////////////


var drawingTools = Map.drawingTools();

drawingTools.setShown(false);

while (drawingTools.layers().length() > 0) {
  var layer = drawingTools.layers().get(0);
  drawingTools.layers().remove(layer);
}


var dummyGeometry =
    ui.Map.GeometryLayer({geometries: null, name: 'geometry', color: '23cba7'});

drawingTools.layers().add(dummyGeometry);


function clearGeometry() {
  var layers = drawingTools.layers();
  layers.get(0).geometries().remove(layers.get(0).geometries().get(0));
}

function drawRectangle() {
  clearGeometry();
  drawingTools.setShape('rectangle');
  drawingTools.draw();
}

function drawPolygon() {
  clearGeometry();
  drawingTools.setShape('polygon');
  drawingTools.draw();
}

function drawPoint() {
  clearGeometry();
  drawingTools.setShape('point');
  drawingTools.draw();
}

var chartPanel = ui.Panel({
  style:
      {height: '235px', width: '600px', position: 'bottom-right', shown: false}
});

Map.add(chartPanel);

var symbol = {
  rectangle: '⬛',
  polygon: '🔺',
  point: '📍',
};


var controlPanel = ui.Panel({
  widgets: [
    ui.Label('1. Select a drawing mode.'),
    ui.Button({
      label: symbol.rectangle + ' Rectangle',
      onClick: drawRectangle,
      style: {stretch: 'horizontal'}
    }),
    ui.Button({
      label: symbol.polygon + ' Polygon',
      onClick: drawPolygon,
      style: {stretch: 'horizontal'}
    }),
    ui.Button({
      label: symbol.point + ' Point',
      onClick: drawPoint,
      style: {stretch: 'horizontal'}
    }),
    ui.Label('2. Draw a geometry.'),
    ui.Label('3. Wait for CDF chart to render.'),
    ui.Label(
        '4. Repeat 1-3 or edit/move\ngeometry for a new chart.',
        {whiteSpace: 'pre'})
  ],
  style: {position: 'bottom-left'},
  layout: null,
});


Map.add(controlPanel);
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



// panel for giving info about drought to user 
// add a panel to give the user some information
var panel = ui.Panel({
  style:
      { width: '600px', position: 'bottom-right', shown: false}
});
Map.add(panel);

/////////////////////////////////////////////////////CDF CHART GENERATING FUNCTION //////////////////////////////

function cdf() {
  // Make the chart panel visible the first time a geometry is drawn
  if (!chartPanel.style().get('shown')) {
    chartPanel.style().set('shown', true);
  }
  
  // Make the info about drought panel visible for the first time a geometry is drawn
   if (!panel.style().get('shown')) {
    panel.style().set('shown', true);
  }

  // Get the drawn geometry; it will define the reduction region.
  var region = drawingTools.layers().get(0).getEeObject();

  // Set the drawing mode back to null; turns drawing off.
  drawingTools.setShape(null);

  // Reduction scale is based on map scale to avoid memory/timeout errors.
  var mapScale = Map.getScale();
  var scale = mapScale > 5000 ? mapScale * 2 : 5000;
  
  

   //////////////////////////////////////Creating the list of soil moisture values//////////////////////////

  var sample1 = soilMoistureNJ.getRegion(region,10000);   // reduces the image collection to only images from the chosen point
  var sample = sample1.remove(sample1.get(0));    // remove the first element since it is not a soil moisture value



  var first = [];  // create an empty list for List.iterate function to work 



// this function takes only the soil moisture value from the list (NOT id, longitude, latitude, etc....)

  var values = function(current,previous){
    var currentQuanitity = ee.List(current).get(4);
    return ee.List(previous).add(ee.Number(currentQuanitity).round());   // values are rounded up
  
  }

// iterate over the sample image collection to only extract the soil moisture value
  var soilMoisture_values = ee.List(sample.iterate(values,first)).sort();



    ///////////////////////////////////////////////////Creating the list of frequencies //////////////////////////////////////
  
// the soil moisture values from 0-25
  var sm_values = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];

  // gets the frequency of each soil moisture value in the region specified by the user
  // filters each soil moisture value and gets the size of that array which is equal to the frequency of that SM value
  var freqs = function(current, previous){
    var currentQuantity = soilMoisture_values.filter(ee.Filter.eq('item', ee.Number(current))).size();
    return ee.List(previous).add(currentQuantity);
  }
  
  
  // iterate over the sm_values list to create a new list of frequencies
  var frequencies = ee.List(ee.List(sm_values).iterate(freqs,first));
  
  
  
  // Compute the cumulative sum of the frequency
  var cumulativeCountsArray = ee.Array(frequencies).accum({axis:0});
  // The last element of the array is the total count, so extract it.
  var totalCount = cumulativeCountsArray.get([-1]);
  // Divide each value by the total so that the values are between 0 and 1
  // This will be the cumulative probability at each Soil Moisture value
  var cumulativeProbabilities = cumulativeCountsArray.divide(totalCount);
  
  // Create a merged array with soil moisture values and cumulative probabilities
  var array = ee.Array.cat({arrays: [sm_values, cumulativeProbabilities], axis:1});

  // FeatureCollections give is a lot of flexibility such as charting, classification etc.
  // Convert the array into a feature collection with null geometries
  var fc = ee.FeatureCollection(array.toList().map(function(list) {
    return ee.Feature(null, {
        soilmoisture: ee.List(list).get(0), 
        probability: ee.List(list).get(1)});
  }));





////////////////////////////////////////////////////////// Giving info to the user on the Map about CDF stats///////////////////////////////


// Create a feature collection based on the point geometries drawn.
var points = ee.FeatureCollection(region);



// Extract the data from the latest SMAP image at the specified pixel 
var data1 = ee.Image(latestIMG)
.reduceRegion(ee.Reducer.first(),region,10).get('ssm');


// turn the data into a number value and round
var value = ee.Number(data1).round();


// get the probabilty of this value 
var probability = cumulativeProbabilities.toList().get(value)


// label for showing latest ssm
var latest_SM = ui.Label("Latest SSM value at this location: "+value.getInfo()+ "mm^3/mm^3");


//label for showing prob of latest ssm
var prob = ui.Label("Probability for this SSM Value at this location based on CDF: " + (ee.Number(probability).format('%.3f')).getInfo());



// check the 40th percentile of ssm values at this current location and print appropriate msg about flash drought
if(ee.Number(probability).getInfo()>0.4){
  var msg = ui.Label(
"Since SSM value is above 40th percentile we estimate no flash drought",{
   color: 'green',
   textDecoration: 'underline',
   fontWeight: 'bold',
   fontSize: '28px'
});

  
}else{
  var msg = ui.Label(
"Since SSM value is below 40th percentile we estimate flash drought",{
   color: 'red',
   textDecoration: 'underline',
   fontWeight: 'bold',
   fontSize: '28px'
});

  
}
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////





// add all the labels we made earlier to the panel on the map for the user
panel.add(latest_SM);
panel.add(prob);
panel.add(msg);



//////////////////////////////////////////////////////////// displaying the cdf chart 
  var options = {
    title: 'CDF of Soil Moisture ',
    fontSize: 20,
    hAxis: {title: 'Soil Moisture'},
    vAxis: {title: 'Probability'},
    series: {
      0: {color: 'blue'},
    }
  }; 
  
  var cdfChart = ui.Chart.feature.byFeature({
    features: fc,
    xProperty: 'soilmoisture',
    yProperties: ['probability']
  }).setOptions(options);



  // Replace the existing chart in the chart panel with the new chart.
  chartPanel.widgets().reset([cdfChart]);
  
  // Replace the existing info panel with a new info panel each time a new geometry is drawn 
  panel.widgets().reset([latest_SM,prob,msg]);
  
}



drawingTools.onDraw(ui.util.debounce(cdf, 500));
drawingTools.onEdit(ui.util.debounce(cdf, 500));
