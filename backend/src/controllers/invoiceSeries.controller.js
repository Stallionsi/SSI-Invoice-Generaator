'use strict';

const seriesService = require('../services/invoiceSeries.service');
const { success, created } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

const list = asyncHandler(async (req, res) => {
  const series = await seriesService.list(req.companyId);
  success(res, { series });
});

const create = asyncHandler(async (req, res) => {
  const series = await seriesService.create(req.companyId, req.body);
  created(res, { series }, 'Invoice series created');
});

const update = asyncHandler(async (req, res) => {
  const series = await seriesService.update(req.companyId, req.params.id, req.body);
  success(res, { series }, 'Invoice series updated');
});

const setDefault = asyncHandler(async (req, res) => {
  const series = await seriesService.setDefault(req.companyId, req.params.id);
  success(res, { series }, 'Default series updated');
});

const remove = asyncHandler(async (req, res) => {
  await seriesService.remove(req.companyId, req.params.id);
  success(res, {}, 'Invoice series deleted');
});

module.exports = { list, create, update, setDefault, remove };
