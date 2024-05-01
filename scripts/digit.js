/* Settings */
var minDistanceFromMarker = 10;   //Setting how close the user needs to be to a marker to trigger its action
var debugMode = true; //set debug mode on or off (disables logging)
var enableTestMarkers = true; //whether or not to place markers for testing purposes on the map

/* options object for geolocation positioning */
const geoLocationOptions = {
	enableHighAccuracy: true, // Get high accuracy reading, if available (default false)
	maximumAge: 2000, // Milliseconds for which it is acceptable to use cached position (default 0)
};

/* END OF SETTINGS -- DON'T EDIT THE CODE BELOW UNLESS YOU KNOW WHAT YOU'RE DOING */

/* Global variables and objects */

/* Map and marker variables */
var map; //holding the LeafletJS map object
var Markers = []; //create a collection for the markers
var MarkersFound = 0; //Counter for markers found

/* GeoLocation variables */
var userPositionMarker; //Marker object for the user's position
var userPositionMarkerCircle; //Marker object for the location precision circle around the user's position
var userZoomed; //variable to keep track of whether the map has zoomed already once to the zoom level of the current position of the user
var userFocussed; //variable to keep track of whether the map has focussed already once to the boundaries of the current position of the user
var manualMarkersPlaced = false; //to check if manual markers have already been placed once
var allMarkersLoaded = false; //to check if all markers have been loaded from the database

/* DOM Elements and event bindings */
document.getElementById("panToLocation").onclick = panZoomToUserLocation;

var geoLocationPermissionButton = document.getElementById("enable-geolocation"); //Get the geolocation permission button
geoLocationPermissionButton.onclick = getGeoLocationPermission;

var gamewelcome = document.getElementById("gamewelcome"); // Get the welcome screen element
var startGameButton = document.getElementById("startgame"); // Get the <button> element that starts the game

/* END OF GLOBAL VARIABLES AND OBJECTS */

function checkGeoLocationPermissionStatus()
{
	navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => 
	{
		if (permissionStatus.state === 'granted') 
		{
			log("yep got location access");
			setGeoLocationButtonMessage('granted');
			
			navigator.geolocation.getCurrentPosition(initGame, null, geoLocationOptions);
		}
		else if (permissionStatus.state === "prompt")
		{
			setGeoLocationButtonMessage('prompt');
		}
		else if (permissionStatus.state === 'denied')
		{
			setGeoLocationButtonMessage('denied');
		}
	});
}
    
  // When the user clicks on button, and the location is available, close the modal, start game
  startGameButton.onclick = function() 
  {
	navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => 
	{
	  if (permissionStatus.state === 'granted') 
	  {
		gamewelcome.style.display = "none";
	  }
	  else if (permissionStatus.state === "prompt")
	  {
		getGeoLocationPermission(onSuccess);

		function onSuccess(result)
		{
			gamewelcome.style.display = "none";
		}
	  }
	  else if(permissionStatus.state === 'denied') 
	  {
		alert("Cannot start game: permission to use location is denied. Please complete step 1.");  
	  }
	});
  }

//check if user permissions have already been given, and set up game in background
//otherwise do nothing, wait for user.
checkGeoLocationPermissionStatus();


  //initiate the map
  map = L.map('map').setView([51.108978, 17.032669], 17);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
	  maxZoom: 19,
	  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  
  //change the style of the map
  L.tileLayer.provider('Thunderforest.Pioneer', {apikey: '8cc9511579274e1489a20d86798ad9fa'}).addTo(map);


//custom Icons for the map
var userLocationIcon = L.icon({
	iconUrl: 'images/gps2.png',
	iconSize: [48, 48],
});

var gnomeIconNotFound = L.icon({
  iconUrl: 'images/gnomered.png',
  iconSize: [32, 32],
});

var gnomeIconFound = L.icon({
  iconUrl: 'images/gnomegreen.png',
  iconSize: [32, 32],
});

//get the data from Mapotic API with AJAX request
function getMarkersFromMapotic()
{
	var req = new XMLHttpRequest();
	req.onreadystatechange = processResponse;
	req.open("GET", "https://www.mapotic.com/api/v1/maps/17890/pois.geojson/");
	req.send();

	function processResponse()
	{
		if (req.readyState != 4) return; // State 4 is DONE

		var mapinfo = JSON.parse(req.responseText);

		mapinfo.features.forEach((feature, i) => {
		if(feature.properties.category_name.en == "Gnome")
		{
			log("adding a gnome at "+feature.geometry.coordinates[0]+", "+feature.geometry.coordinates[1]);
			var lng = feature.geometry.coordinates[0];
			var lat = feature.geometry.coordinates[1];
			var gnomeMarker = L.marker([lat, lng], {icon: gnomeIconNotFound}).addTo(map);
			addMarkerToGame(gnomeMarker);
		}
		});

		document.getElementById("totalitems").innerHTML = Markers.length;
		checkDistanceToMarkers(userPositionMarker);
		}
}

/* Function to get location permission from user */
function getGeoLocationPermission(onSuccessCallback)
{
	navigator.geolocation.getCurrentPosition(onLocationPermissionGranted, onError, geoLocationOptions);

	function onLocationPermissionGranted(pos)
	{
		setGeoLocationButtonMessage('granted');
		initGame(pos);
		
		if(onSuccessCallback)
			onSuccessCallback(true);
	}

	function onError(err)
	{
		if (err.code === 1) {
			alert("You cannot run the game without geolocation access. Please try again.");
			setGeoLocationButtonMessage('denied');
			// Runs if user refuses access
		} else {
			log("error code getting location: "+err.code);
			log(err);
			// Runs if there was a technical problem.
		}		  
	}
}

function watchUserPosition()
{
  navigator.geolocation.watchPosition(updateGame, error, geoLocationOptions);
  // Fires success function immediately and when user position changes

  function error(err) {
	log(err);
	  if (err.code === 1) 
	  {
		  alert("While watching your position, your permission changed. You cannot run the game without geolocation access. Please try again.");
		  gamewelcome.style.display = "block";
		  checkGeoLocationPermissionStatus();
	  } 
	  else 
	  {
		  log("error code getting location: "+err.code);
		  log(err);
		  // Runs if there was a technical problem.
	  }
  }
}

function initGame(pos)
{
	if(!pos)
	{
		log("No GeoLocation object provided, can't init game...");
		return false;
	}

	const lat = pos.coords.latitude;
	const lng = pos.coords.longitude;
	const accuracy = pos.coords.accuracy; // Accuracy in metres

	//add all the markers from the database, if not done already
	if(!allMarkersLoaded)
	{
	  getMarkersFromMapotic();
	  allMarkersLoaded = true;
	}

	placeUpdateUserPositionMarker(pos);

	//check distance to markers
	checkDistanceToMarkers(userPositionMarker)
	
	//adding some Markers manually to be able to test this anywhere
	if(!manualMarkersPlaced && enableTestMarkers)
	{
	  addManualMarkersForTesting(lat, lng);
	  manualMarkersPlaced = true;
	}

	panZoomToUserLocation();
	userZoomed = true;
	userFocussed = true;

	watchUserPosition();

}

  function updateGame(pos) {
    log("Position of user changed, checking markers, updating...");   
	
	//update user position marker
	placeUpdateUserPositionMarker(pos);

	//check distance to markers
	checkDistanceToMarkers(userPositionMarker)
}

function placeUpdateUserPositionMarker(pos)
{
	const lat = pos.coords.latitude;
	const lng = pos.coords.longitude;
	const accuracy = pos.coords.accuracy; // Accuracy in metres

	// Removes any existing user position marker and circles, if set (new ones about to be set)
	if (userPositionMarker) 
	{
		map.removeLayer(userPositionMarker);
		map.removeLayer(userPositionMarkerCircle);
	}

	// Adds marker indicating user position to the map and a circle for accuracy
	userPositionMarker = L.marker([lat, lng], {icon: userLocationIcon}).addTo(map);
	userPositionMarkerCircle = L.circle([lat, lng], { radius: accuracy }).addTo(map);

}

  function checkDistanceToMarkers(userMarker)
  {
	log("userMarker: ");
	log(userMarker);
	log("Markers: ");
	log(Markers);

	Markers.forEach((marker, index) => {
	  var distanceFromUser = getUserDistanceFromMarker(marker);
	  log("distance from user: "+distanceFromUser+"m");
	  marker.setTooltipContent("You are not close enough to collect this item ("+distanceFromUser+"m)");

	  if(distanceFromUser <= minDistanceFromMarker && !marker.found)
	  {
	   // updateGameStats();
			   
		enableMarker(marker);
	  }
	});

  }

  function getUserDistanceFromMarker(marker)
  {
	 var userLatLng = userPositionMarker.getLatLng();
	 var markerLatLng = marker.getLatLng();
	 
	 return Math.floor(userLatLng.distanceTo(markerLatLng));
  }

  
  function addManualMarkersForTesting(lat, lng)
  {
	// Calculate the destination coordinates 8 meters east (90 degrees) of the current user's location
	var destinationCoordinates = calculateDestination(lat, lng, 8, 90);
	log("will place a random gnome 8m away at bearing 90 resulting in "+destinationCoordinates);
  
	// Add a gnome marker at the destination coordinates  
	var gnomeMarker = L.marker(destinationCoordinates, {icon: gnomeIconNotFound}).addTo(map);
	addMarkerToGame(gnomeMarker);
	enableMarker(gnomeMarker); //force at least one marker found (closest) so testing is easier...
	
	//add some Markers at random places
	for (var i = 0; i < 4; i++)
	{
		var meters = Math.floor(Math.random() * 150);
		var bearing = Math.floor(Math.random() * 360);
		var destinationCoordinates = calculateDestination(lat, lng, meters, bearing);
		log("will place a random gnome "+meters+"m away at bearing "+bearing+" resulting in "+destinationCoordinates);
		var gnomeMarker = L.marker(destinationCoordinates, {icon: gnomeIconNotFound}).addTo(map);
		addMarkerToGame(gnomeMarker);
	}
	
  }
	
  function panZoomToUserLocation()
  {
	userLatLng = userPositionMarker.getLatLng();
	map.setView([userLatLng.lat, userLatLng.lng]);
	// Set map focus to current user position
	
	map.fitBounds(userPositionMarkerCircle.getBounds());
	// Set zoom to boundaries of accuracy circle    
  }

  // Function to calculate destination coordinates
  function calculateDestination(lat, lon, distance, bearing) {
	  var R = 6378137; // Earth's radius in meters
	  var brng = bearing * (Math.PI / 180); // Convert bearing to radians
	  var lat1 = lat * (Math.PI / 180); // Convert current latitude to radians
	  var lon1 = lon * (Math.PI / 180); // Convert current longitude to radians
  
	  var lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
						   Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
	  var lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
								   Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
  
	  lat2 = lat2 * (180 / Math.PI); // Convert back to degrees
	  lon2 = lon2 * (180 / Math.PI); // Convert back to degrees
  
	  return [lat2, lon2];
  }
  
  function addMarkerToGame(marker)
  {
	marker.markerID = Markers.length + 1;
	//add tooltip to indicate user not close enough by default...
	marker.bindTooltip("You are not close enough to collect this item ("+getUserDistanceFromMarker(marker)+"m)");
	Markers.push(marker);
  }
  
  function enableMarker(marker)
  {
	marker.found = 1; //mark this gnome as found
	marker.setIcon(gnomeIconFound); //green icon
	
	var popupContent = '<h4>This would contain the content of marker '+(marker.markerID)+'...</h4><iframe width="300" height="300" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=M7nPi4kHAJD7aQVC" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
	marker.bindPopup(popupContent);
	marker.unbindTooltip();
	updateGameStats();
  }
  
  function updateGameStats()
  {
	MarkersFound = MarkersFound + 1;
	document.getElementById("itemsfound").innerHTML = MarkersFound; //update counter  
  }

  function log(msg)
  {
	if(debugMode)
		console.log(msg);
  }

  function setGeoLocationButtonMessage(id)
  {
	if(id == "granted")
	{
		geoLocationPermissionButton.innerHTML = '<i class="fa fa-check"></i> Geolocation access granted';
		//geoLocationPermissionButton.onclick = function() { log("ok removing event listener..."); }
	}
	else if(id == "denied")
	{
		geoLocationPermissionButton.innerHTML = '<i class="fa fa-times-circle"></i> Geolocation access denied. Please manually enable in your browser settings and refresh page.';
	}
	else if(id == "prompt")
	{
		geoLocationPermissionButton.innerHTML = 'Enable geolocation';
		geoLocationPermissionButton.onclick = getGeoLocationPermission;
	}
  }