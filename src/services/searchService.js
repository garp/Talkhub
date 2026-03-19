const axios = require('axios');
const userServices = require('./userServices');
const hashtagServices = require('./hashtagServices');
const env = require('../../lib/configs/env.config');

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180))
        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Search for people within a radius
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radius - Radius in meters
 * @returns {Promise<Array>} Array of user objects
 */
async function searchPeople(latitude, longitude, radius) {
  try {
    // Get all users with location data
    const users = await userServices.find({
      filter: {
        'location.coordinates': { $exists: true, $ne: null },
        active: true,
      },
      projection: {
        _id: 1,
        fullName: 1,
        userName: 1,
        profilePicture: 1,
        fullLocation: 1,
        location: 1,
        description: 1,
      },
    });

    // Filter and map users within radius, calculate distance for sorting
    const usersWithDistance = users
      .filter((user) => {
        if (!user.location || !user.location.coordinates || user.location.coordinates.length < 2) {
          return false;
        }
        const [userLon, userLat] = user.location.coordinates;
        const distance = calculateDistance(latitude, longitude, userLat, userLon);
        return distance <= radius;
      })
      .map((user) => {
        const [userLon, userLat] = user.location.coordinates;
        const distance = calculateDistance(latitude, longitude, userLat, userLon);
        return {
          type: 'people',
          displayName: user.fullName || user.userName || 'Unknown',
          address: user.fullLocation || '',
          location: {
            latitude: userLat,
            longitude: userLon,
          },
          rating: null,
          userRatingCount: 0,
          photos: user.profilePicture ? [user.profilePicture] : [],
          distance: distance || null,
          _sortDistance: distance, // Temporary field for sorting
        };
      })
      .sort((a, b) => a._sortDistance - b._sortDistance);

    // Remove temporary sorting field
    const nearbyUsers = usersWithDistance.map(({ _sortDistance, ...user }) => user);

    return nearbyUsers;
  } catch (error) {
    throw new Error(`Error searching people: ${error.message}`);
  }
}

/**
 * Search for hashtags within a radius
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radius - Radius in meters
 * @returns {Promise<Array>} Array of hashtag objects
 */
async function searchHashtags(latitude, longitude, radius) {
  try {
    // Get all hashtags with location data
    const hashtags = await hashtagServices.find({
      filter: {
        'location.coordinates': { $exists: true, $ne: null },
      },
      projection: {
        _id: 1,
        name: 1,
        description: 1,
        fullLocation: 1,
        location: 1,
        hashtagPhoto: 1,
        hashtagBanner: 1,
        likeCount: 1,
        viewCount: 1,
      },
    });

    // Filter and map hashtags within radius, calculate distance for sorting
    const hashtagsWithDistance = hashtags
      .filter((hashtag) => {
        if (!hashtag.location || !hashtag.location.coordinates || hashtag.location.coordinates.length < 2) {
          return false;
        }
        const [hashtagLon, hashtagLat] = hashtag.location.coordinates;
        const distance = calculateDistance(latitude, longitude, hashtagLat, hashtagLon);
        return distance <= radius;
      })
      .map((hashtag) => {
        const [hashtagLon, hashtagLat] = hashtag.location.coordinates;
        const distance = calculateDistance(latitude, longitude, hashtagLat, hashtagLon);
        return {
          type: 'hashtag',
          displayName: hashtag.name || 'Unnamed Hashtag',
          address: hashtag.fullLocation || '',
          location: {
            latitude: hashtagLat,
            longitude: hashtagLon,
          },
          rating: null,
          userRatingCount: hashtag.likeCount || 0,
          photos: hashtag.hashtagPhoto ? [hashtag.hashtagPhoto] : [],
          distance: distance || null,
          _sortDistance: distance, // Temporary field for sorting
        };
      })
      .sort((a, b) => a._sortDistance - b._sortDistance);

    // Remove temporary sorting field
    const nearbyHashtags = hashtagsWithDistance.map(({ _sortDistance, ...hashtag }) => hashtag);

    return nearbyHashtags;
  } catch (error) {
    throw new Error(`Error searching hashtags: ${error.message}`);
  }
}

/**
 * Search Google Places API
 * @param {string} searchType - Type of place to search (cafe, restaurant, hotel, museum, hospital)
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radius - Radius in meters
 * @returns {Promise<Array>} Array of place objects
 */
async function searchGooglePlaces(searchType, latitude, longitude, radius) {
  try {
    const apiKey = env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error('Google Places API key is not configured');
    }

    const url = 'https://places.googleapis.com/v1/places:searchNearby';
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.types,places.location',
    };

    const requestBody = {
      includedTypes: [searchType],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: {
            latitude,
            longitude,
          },
          radius,
        },
      },
    };

    const response = await axios.post(url, requestBody, { headers });

    if (!response.data || !response.data.places) {
      return [];
    }

    // Transform Google Places response to unified format
    const places = response.data.places.map((place) => {
      const photos = (place.photos || []).map((photo) => {
        // Construct photo URL
        const photoName = photo.name || '';
        return `https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxWidthPx=800`;
      });

      // Calculate distance for sorting
      let distance = null;
      if (place.location) {
        distance = calculateDistance(
          latitude,
          longitude,
          place.location.latitude,
          place.location.longitude,
        );
      }

      return {
        type: searchType,
        id: place.id || '',
        displayName: place.displayName?.text || '',
        address: place.formattedAddress || '',
        location: place.location ? {
          latitude: place.location.latitude,
          longitude: place.location.longitude,
        } : null,
        rating: place.rating || null,
        userRatingCount: place.userRatingCount || 0,
        photos: photos || [],
        distance: distance || null,
        _sortDistance: distance, // Temporary field for sorting
      };
    });

    // Sort by distance and remove temporary field
    const sortedPlaces = places
      .filter((p) => p._sortDistance !== null)
      .sort((a, b) => a._sortDistance - b._sortDistance)
      .map(({ _sortDistance, ...place }) => place);

    return sortedPlaces;
  } catch (error) {
    if (error.response) {
      // API error response
      throw new Error(`Google Places API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`Error searching Google Places: ${error.message}`);
  }
}

/**
 * Unified search function
 * @param {string} searchType - Type of search (people, hashtag, cafe, restaurant, hotel, museum, hospital)
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radius - Radius in meters
 * @returns {Promise<Array>} Array of search results in unified format
 */
exports.searchNearby = async (searchType, latitude, longitude, radius) => {
  let results = [];
  if (searchType === 'all') {
    // Use Promise.allSettled to handle partial failures gracefully
    const searchPromises = [
      searchPeople(latitude, longitude, radius).catch((err) => {
        console.error('Error searching people:', err.message);
        return [];
      }),
      searchHashtags(latitude, longitude, radius).catch((err) => {
        console.error('Error searching hashtags:', err.message);
        return [];
      }),
      searchGooglePlaces('cafe', latitude, longitude, radius).catch((err) => {
        console.error('Error searching cafes:', err.message);
        return [];
      }),
      searchGooglePlaces('restaurant', latitude, longitude, radius).catch((err) => {
        console.error('Error searching restaurants:', err.message);
        return [];
      }),
      searchGooglePlaces('hotel', latitude, longitude, radius).catch((err) => {
        console.error('Error searching hotels:', err.message);
        return [];
      }),
      searchGooglePlaces('museum', latitude, longitude, radius).catch((err) => {
        console.error('Error searching museums:', err.message);
        return [];
      }),
      searchGooglePlaces('hospital', latitude, longitude, radius).catch((err) => {
        console.error('Error searching hospitals:', err.message);
        return [];
      }),
    ];

    const settledResults = await Promise.allSettled(searchPromises);

    // Extract successful results and flatten the array
    const allResults = [];
    settledResults.forEach((result) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allResults.push(...result.value);
      }
    });

    // Calculate distance for all results and sort
    const resultsWithDistance = allResults.map((item) => {
      if (item.location && item.location.latitude && item.location.longitude) {
        const distance = calculateDistance(
          latitude,
          longitude,
          item.location.latitude,
          item.location.longitude,
        );
        return { ...item, _sortDistance: distance };
      }
      return { ...item, _sortDistance: Infinity }; // Put items without location at the end
    });

    // Sort by distance and remove temporary field
    results = resultsWithDistance
      .sort((a, b) => a._sortDistance - b._sortDistance)
      .map(({ _sortDistance, ...item }) => item);
  } else if (searchType === 'people') {
    results = await searchPeople(latitude, longitude, radius);
  } else if (searchType === 'hashtag') {
    results = await searchHashtags(latitude, longitude, radius);
  } else {
    // Use Google Places API for other types
    results = await searchGooglePlaces(searchType, latitude, longitude, radius);
  }

  return results;
};

/**
 * Get place details from Google Places API
 * @param {string} placeId - Google Places place ID
 * @returns {Promise<Object>} Formatted place details object
 */
exports.getPlaceDetails = async (placeId) => {
  try {
    const apiKey = env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error('Google Places API key is not configured');
    }

    if (!placeId || typeof placeId !== 'string' || placeId.trim() === '') {
      throw new Error('Invalid place ID provided');
    }

    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,userRatingCount,types,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,priceLevel,dineIn,takeout,delivery,reviews,editorialSummary,photos,regularOpeningHours.weekdayDescriptions,currentOpeningHours.openNow',
    };

    let response;
    try {
      response = await axios.get(url, { headers });
    } catch (axiosError) {
      // Log detailed error information for debugging
      console.error('Google Places API Request Error:', {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        message: axiosError.message,
        url,
      });

      if (axiosError.response) {
        // API returned an error response
        const { status } = axiosError.response;
        const errorData = axiosError.response.data;
        throw new Error(`Google Places API error: ${status} - ${JSON.stringify(errorData)}`);
      } else if (axiosError.request) {
        // Request was made but no response received
        throw new Error(`Google Places API error: No response received - ${axiosError.message}`);
      } else {
        // Error setting up the request
        throw new Error(`Google Places API error: ${axiosError.message}`);
      }
    }

    if (!response.data) {
      throw new Error('No data received from Google Places API');
    }

    const placeData = response.data;
    console.log('Place Data Received:', JSON.stringify(placeData, null, 2));

    // Transform to custom format with safe field access
    const formattedResponse = {
      id: placeData.id || null,
      nationalPhoneNumber: placeData.nationalPhoneNumber || null,
      internationalPhoneNumber: placeData.internationalPhoneNumber || null,
      formattedAddress: placeData.formattedAddress || null,
      location: placeData.location ? {
        latitude: placeData.location.latitude || null,
        longitude: placeData.location.longitude || null,
      } : null,
      rating: placeData.rating || null,
      googleMapsUri: placeData.googleMapsUri || null,
      websiteUri: placeData.websiteUri || null,
      regularOpeningHours: placeData.regularOpeningHours?.weekdayDescriptions || [],
      delivery: placeData.delivery !== undefined ? placeData.delivery : null,
      userRatingCount: placeData.userRatingCount || null,
      Name: placeData.displayName?.text || placeData.editorialSummary?.text || null,
      reviews: (placeData.reviews || []).map((review) => ({
        name: review.name || null,
        relativePublishTimeDescription: review.relativePublishTimeDescription || null,
        rating: review.rating || null,
        text: review.text?.text || review.originalText?.text || null,
        authorAttribution: review.authorAttribution ? {
          displayName: review.authorAttribution.displayName || null,
          uri: review.authorAttribution.uri || null,
          photoUri: review.authorAttribution.photoUri || null,
        } : null,
        publishTime: review.publishTime || null,
      })),
      photos: (placeData.photos || []).map((photo) => {
        // Construct image URL using photo name
        const imageUrl = photo.name
          ? `https://places.googleapis.com/v1/${photo.name}/media?key=${apiKey}&maxWidthPx=800`
          : null;

        return {
          imageUrl, // Add the constructed image URL
          authorAttributions: (photo.authorAttributions || []).map((author) => ({
            displayName: author.displayName || null,
            uri: author.uri || null,
            photoUri: author.photoUri || null,
          })),
          flagContentUri: photo.flagContentUri || null,
          googleMapsUri: photo.googleMapsUri || null,
        };
      }),
    };

    return formattedResponse;
  } catch (error) {
    // Re-throw errors that are already formatted
    if (error.message.includes('Google Places API error:')) {
      throw error;
    }

    // Handle unexpected errors
    console.error('Unexpected error in getPlaceDetails:', error);
    throw new Error(`Error fetching place details: ${error.message}`);
  }
};
